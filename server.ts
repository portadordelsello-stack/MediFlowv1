import express from 'express';
import { createServer as createViteServer } from 'vite';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (Lazy)
const firebaseAppConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

let adminApp: admin.app.App | null = null;
let firestoreDb: admin.firestore.Firestore | null = null;

function getFirebaseAdmin() {
  if (!adminApp) {
    adminApp = admin.initializeApp({
      projectId: firebaseAppConfig.projectId,
    });
  }
  return adminApp;
}

function getDb(): admin.firestore.Firestore {
  if (!firestoreDb) {
    const app = getFirebaseAdmin();
    firestoreDb = getFirestore(app, firebaseAppConfig.firestoreDatabaseId);
  }
  return firestoreDb;
}

// Agent Platform Configuration
let ai: GoogleGenAI | null = null;
const configPath = path.join(process.cwd(), 'system-config.json');

function getSystemConfig() {
  const envConfig = {
    apiKey: process.env.AGENT_PLATFORM_API_KEY || '',
    projectId: process.env.VERTEX_PROJECT_ID || '',
    location: process.env.VERTEX_LOCATION || 'us-central1',
    limits: {
      GRATIS: 100,
      BASICO: 500,
      PREMIUM: 1000
    }
  };

  if (fs.existsSync(configPath)) {
     try {
       const savedData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
       const mergedLimits = { ...envConfig.limits, ...(savedData.limits || {}) };
       return { ...envConfig, ...savedData, limits: mergedLimits };
     } catch (e) {
       console.error("Error reading system config", e);
     }
  }
  return envConfig;
}

function initializeAI() {
  const cfg = getSystemConfig();
  if (cfg.apiKey && cfg.projectId && cfg.location) {
    ai = new GoogleGenAI({ 
        // @ts-ignore
        vertexai: { project: cfg.projectId, location: cfg.location },
        apiKey: cfg.apiKey
    });
    console.log("AI initialized with project:", cfg.projectId);
  } else {
    ai = null;
    console.log("AI initialization skipped. Missing configurations.");
  }
}

initializeAI();

const PORT = 3000;
const app = express();
app.use(express.json());

interface AppConfig {
  botActive: boolean;
  systemPrompt: string;
  name: string;
  plan: string;
  messagesUsed: number;
}

// In-memory store for WhatsApp clients and configs
const waClients = new Map<string, any>();
const waQRCodes = new Map<string, string>();
const waStatus = new Map<string, string>();
const waConfigs = new Map<string, AppConfig>();

async function startWhatsAppBot(clinicId: string, host: string) {
  const authFolder = path.join(process.cwd(), 'wa_clients', clinicId);
  const bookingUrl = `https://${host}/reservar/${clinicId}`;
  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const logger = pino({ level: 'silent' });
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      waStatus.set(clinicId, 'QR_READY');
      try {
        const qrBase64 = await QRCode.toDataURL(qr);
        waQRCodes.set(clinicId, qrBase64);
      } catch (err) {
        console.error('Failed to generate QR', err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      waStatus.set(clinicId, 'DISCONNECTED');
      if (shouldReconnect) {
        setTimeout(() => startWhatsAppBot(clinicId, host), 5000);
      } else {
        waQRCodes.delete(clinicId);
        if (fs.existsSync(authFolder)) {
          fs.rmSync(authFolder, { recursive: true, force: true });
        }
        waClients.delete(clinicId);
      }
    } else if (connection === 'open') {
      waStatus.set(clinicId, 'CONNECTED');
      waQRCodes.delete(clinicId);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    for (const msg of m.messages) {
      if (!msg.message || msg.key.fromMe) continue;
      
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) continue; 
      
      const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!textMessage) continue;

      const clinicConfig = waConfigs.get(clinicId);
      if (!clinicConfig || !clinicConfig.botActive) continue;

      const systemConfig = getSystemConfig();
      const plan = clinicConfig.plan || 'GRATIS';
      const limit = systemConfig.limits[plan as keyof typeof systemConfig.limits] || 0;

      if (clinicConfig.messagesUsed >= limit) {
         continue; // Reject since limit is reached
      }

      if (ai) {
        try {
          // Check if message is a booking confirmation link text
          // Example: "Hola! Soy Juan Pérez (DNI: 1234). He reservado un turno para el 2026-05-24 a las 17:30h."
          const bookingMatch = textMessage.match(/He reservado un turno para el (\d{4}-\d{2}-\d{2}) a las (\d{2}:\d{2})h/);
          const dniMatch = textMessage.match(/\(DNI: (.*?)\)/);

          if (bookingMatch && dniMatch) {
            const date = bookingMatch[1];
            const time = bookingMatch[2];
            const dni = dniMatch[1];

            console.log(`Potential booking confirmation detected for DNI ${dni} on ${date} at ${time}`);

            // Find the patient first
            const patientsRef = getDb().collection('clinics').doc(clinicId).collection('patients');
            const patientSnap = await patientsRef.where('dni', '==', dni).limit(1).get();

            if (!patientSnap.empty) {
              const patientId = patientSnap.docs[0].id;
              const appointmentsRef = getDb().collection('clinics').doc(clinicId).collection('appointments');
              
              // Find or create the appointment
              const appSnap = await appointmentsRef
                .where('patientId', '==', patientId)
                .where('date', '==', date)
                .where('time', '==', time)
                .limit(1)
                .get();

              if (!appSnap.empty) {
                await appSnap.docs[0].ref.update({ status: 'CONFIRMED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              } else {
                // Create if it doesn't exist (though it should have been created by the portal or we can create it now)
                await appointmentsRef.add({
                  clinicOwnerId: clinicId,
                  patientId,
                  patientDni: dni,
                  date,
                  time,
                  status: 'CONFIRMED',
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
              }
              
              await sock.sendMessage(remoteJid, { text: `¡Perfecto! Su turno para el ${date} a las ${time}h ha sido CONFIRMADO. ¡Lo esperamos!` });
              
              const clinicRef = getDb().collection('clinics').doc(clinicId);
              await clinicRef.update({ 
                messagesUsed: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp() 
              });
              
              continue; // Skip AI generation for this message as it's handled
            }
          }

          const systemPrompt = clinicConfig.systemPrompt || "Eres un asistente virtual médico. Responde en español, sé sumamente cordial.";

          await sock.presenceSubscribe(remoteJid);
          await sock.sendPresenceUpdate('composing', remoteJid);
          
          const bookingUrl = `https://${host}/reservar/${clinicId}`;
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Mensaje del paciente: "${textMessage}"`,
            config: {
              systemInstruction: `Eres el agente inteligente de una clínica médica. El nombre de la clínica es "${clinicConfig.name}". Solo tienes tareas de soporte, agendamiento y respuestas a dudas generales. Sigue estas instrucciones: ${systemPrompt}. Si el paciente desea agendar un turno, proporciónale este link de nuestra agenda online: ${bookingUrl}`
            }
          });

          const replyText = response.text || 'Error generando respuesta.';

          await sock.sendPresenceUpdate('paused', remoteJid);
          await sock.sendMessage(remoteJid, { text: replyText });
          
          // Increment messagesUsed in DB
          const clinicRef = getDb().collection('clinics').doc(clinicId);
          await clinicRef.update({ 
            messagesUsed: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp() 
          });

          clinicConfig.messagesUsed += 1;
          waConfigs.set(clinicId, clinicConfig);

        } catch (err) {
          console.error("AI Error:", err);
          await sock.sendPresenceUpdate('paused', remoteJid);
        }
      } else {
        console.error("AI instance not initialized. Cannot answer.");
      }
    }
  });

  waClients.set(clinicId, sock);
}

// System Admin API
app.get('/api/admin/system-config', (req, res) => {
   res.json(getSystemConfig());
});

app.post('/api/admin/system-config', (req, res) => {
   const { apiKey, projectId, location, limits } = req.body;
   const existing = getSystemConfig();
   const newConfig = { ...existing, apiKey, projectId, location, limits: limits || existing.limits };
   fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
   initializeAI();
   res.json({ success: true });
});

// We need a way for regular clients to get the limits
app.get('/api/system-limits', (req, res) => {
   res.json(getSystemConfig().limits);
});

// API Routes
app.post('/api/whatsapp/start', async (req, res) => {
  const { clinicId } = req.body;
  if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
  const host = req.get('host') || 'localhost:3000';
  
  if (!waClients.has(clinicId)) {
    waStatus.set(clinicId, 'INITIALIZING');
    await startWhatsAppBot(clinicId, host);
  }
  
  res.json({ status: waStatus.get(clinicId) });
});

app.post('/api/whatsapp/config', (req, res) => {
  const { clinicId, botActive, systemPrompt, name, plan, messagesUsed } = req.body;
  if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
  
  const existingConfig = waConfigs.get(clinicId);
  const newMessagesUsed = Math.max(existingConfig?.messagesUsed || 0, messagesUsed || 0);

  waConfigs.set(clinicId, {
     botActive: !!botActive,
     systemPrompt: systemPrompt || '',
     name: name || 'Clínica',
     plan: plan || 'GRATIS',
     messagesUsed: newMessagesUsed
  });
  res.json({ success: true });
});

app.get('/api/whatsapp/status/:clinicId', (req, res) => {
  const { clinicId } = req.params;
  const status = waStatus.get(clinicId) || 'DISCONNECTED';
  const qr = waQRCodes.get(clinicId) || null;
  const clinicConfig = waConfigs.get(clinicId);
  const messagesUsed = clinicConfig ? clinicConfig.messagesUsed : null;
  
  res.json({ status, qr, messagesUsed });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

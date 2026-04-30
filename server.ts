import express from 'express';
import { createServer as createViteServer } from 'vite';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import admin from 'firebase-admin';
import firebaseConfig from './firebase-applet-config.json';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
}
const adminDb = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
adminDb.settings({ ignoreUndefinedProperties: true });

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

async function startWhatsAppBot(clinicId: string) {
  const authFolder = path.join(process.cwd(), 'wa_clients', clinicId);
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
        setTimeout(() => startWhatsAppBot(clinicId), 5000);
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
          const systemPrompt = clinicConfig.systemPrompt || "Eres un asistente virtual médico. Responde en español, sé sumamente cordial.";

          await sock.presenceSubscribe(remoteJid);
          await sock.sendPresenceUpdate('composing', remoteJid);
          
          let responseText = '';
          const sysInstruction = `Eres el agente inteligente de una clínica médica. El nombre de la clínica es "${clinicConfig.name}". Solo tienes tareas de soporte, agendamiento y respuestas a dudas generales. Sigue estas instrucciones: ${systemPrompt}`;
          
          try {
             const chat = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: {
                   systemInstruction: sysInstruction,
                   temperature: 0.1,
                   tools: [{
                     functionDeclarations: [
                       {
                         name: 'check_appointments',
                         description: 'Get all appointments for a given date in YYYY-MM-DD format (or all if not specified).',
                         parameters: { type: Type.OBJECT, properties: { date: { type: Type.STRING } } }
                       },
                       {
                         name: 'schedule_appointment',
                         description: 'Schedule a new appointment. You must provide patientId, date (YYYY-MM-DD), time (HH:MM), type.',
                         parameters: {
                           type: Type.OBJECT,
                           properties: {
                              patientId: { type: Type.STRING },
                              date: { type: Type.STRING },
                              time: { type: Type.STRING },
                              type: { type: Type.STRING }
                           },
                           required: ['patientId', 'date', 'time']
                         }
                       },
                       {
                         name: 'list_patients',
                         description: 'Lists all registered patients to find the patientId. Search by name or fetch all.',
                         parameters: { type: Type.OBJECT, properties: { nameQuery: { type: Type.STRING } } }
                       }
                     ]
                   }]
                }
             });

             let result = await chat.sendMessage({ message: `Mensaje del paciente: "${textMessage}"` });

             while (result.functionCalls && result.functionCalls.length > 0) {
                const funcCall = result.functionCalls[0];
                const name = funcCall.name;
                const args = funcCall.args as any;
                let funcResponse: any = { error: 'Unknown function' };

                if (name === 'check_appointments') {
                   const qs = adminDb.collection('clinics').doc(clinicId).collection('appointments');
                   const snap = await qs.get();
                   const appts = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                   const filtered = args.date ? appts.filter(a => a.date === args.date) : appts;
                   funcResponse = { appointments: filtered };
                } else if (name === 'list_patients') {
                   const qs = adminDb.collection('clinics').doc(clinicId).collection('patients');
                   const snap = await qs.get();
                   let patients = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                   if (args.nameQuery) {
                       patients = patients.filter(p => (p.name as string).toLowerCase().includes(args.nameQuery.toLowerCase()));
                   }
                   funcResponse = { patients };
                } else if (name === 'schedule_appointment') {
                   const patientSnap = await adminDb.collection('clinics').doc(clinicId).collection('patients').doc(args.patientId).get();
                   if (!patientSnap.exists) {
                       funcResponse = { error: 'Patient not found' };
                   } else {
                       const ref = await adminDb.collection('clinics').doc(clinicId).collection('appointments').add({
                           clinicOwnerId: clinicId,
                           patientId: args.patientId,
                           patientName: patientSnap.data()?.name || '',
                           date: args.date,
                           time: args.time,
                           type: args.type || 'Consulta General',
                           status: 'SCHEDULED',
                           createdAt: admin.firestore.FieldValue.serverTimestamp(),
                           updatedAt: admin.firestore.FieldValue.serverTimestamp()
                       });
                       funcResponse = { success: true, appointmentId: ref.id };
                   }
                }

                result = await chat.sendMessage({
                   message: [{
                      functionResponse: {
                         name: name,
                         response: funcResponse
                      }
                   }]
                });
             }
             
             responseText = result.text || 'Error generando respuesta.';
          } catch(e) {
             console.error("AI flow error:", e);
             responseText = "Disculpa, tuvimos un problema al procesar tu solicitud.";
          }

          await sock.sendPresenceUpdate('paused', remoteJid);
          await sock.sendMessage(remoteJid, { text: responseText });
          
          clinicConfig.messagesUsed += 1;
          waConfigs.set(clinicId, clinicConfig);

          // Update messagesUsed remotely
          adminDb.collection('clinics').doc(clinicId).update({
             messagesUsed: clinicConfig.messagesUsed,
             updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }).catch(err => console.error("Could not update messagesUsed in DB", err));

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
  
  if (!waClients.has(clinicId)) {
    waStatus.set(clinicId, 'INITIALIZING');
    await startWhatsAppBot(clinicId);
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

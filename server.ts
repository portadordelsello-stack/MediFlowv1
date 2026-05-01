import express from 'express';
import { createServer as createViteServer } from 'vite';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminDb: FirebaseFirestore.Firestore | null = null;
try {
  const firebaseAppConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
  const adminApp = initializeApp({
    credential: applicationDefault(),
    projectId: firebaseAppConfig.projectId
  });
  adminDb = getFirestore(adminApp, firebaseAppConfig.firestoreDatabaseId);
  console.log("Firebase Admin successfully initialized.");
} catch (e) {
  console.error("Error initializing Firebase Admin", e);
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

          const firestoreTools = [
            {
              functionDeclarations: [
                {
                  name: "readDocument",
                  description: "Lee un documento específico de la base de datos Firestore",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      collectionPath: { type: "STRING" },
                      documentId: { type: "STRING" }
                    },
                    required: ["collectionPath", "documentId"]
                  }
                },
                {
                  name: "writeDocument",
                  description: "Escribe (crea o actualiza) un documento en la base de datos Firestore",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      collectionPath: { type: "STRING" },
                      documentId: { type: "STRING", description: "El ID del documento o vacio para auto-generar" },
                      data: { type: "STRING", description: "String en formato JSON de los datos" }
                    },
                    required: ["collectionPath", "data"]
                  }
                },
                {
                  name: "queryCollection",
                  description: "Lee documentos de una colección en la base de datos Firestore",
                  parameters: {
                    type: "OBJECT",
                    properties: {
                      collectionPath: { type: "STRING" }
                    },
                    required: ["collectionPath"]
                  }
                }
              ]
            }
          ];

          let chatContents: any[] = [{ role: 'user', parts: [{ text: `Mensaje del paciente: "${textMessage}"` }] }];
          let aiResponseText: string | null = null;
          let iterations = 0;

          await sock.presenceSubscribe(remoteJid);
          await sock.sendPresenceUpdate('composing', remoteJid);

          while (!aiResponseText && iterations < 5) {
            iterations++;
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: chatContents,
              config: {
                systemInstruction: `Eres el agente inteligente de una clínica médica. Tienes acceso a la base de datos de paciente y registros. El nombre de la clínica es "${clinicConfig.name}". Solo tienes tareas de soporte, agendamiento y respuestas a dudas generales. Sigue estas instrucciones: ${systemPrompt}`,
                tools: firestoreTools
              }
            });

            if (response.functionCalls && response.functionCalls.length > 0) {
              const fCall = response.functionCalls[0];
              const callName = fCall.name;
              const args: any = fCall.args || {};
              
              chatContents.push({ role: 'model', parts: [{ functionCall: fCall }] });

              let fResData: any = {};
              try {
                if (!adminDb) throw new Error("Database not connected");

                if (callName === 'readDocument') {
                   const docSnap = await adminDb.collection(args.collectionPath).doc(args.documentId).get();
                   fResData = docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : { error: "Not found" };
                } else if (callName === 'writeDocument') {
                   const parsedData = JSON.parse(args.data);
                   if (args.documentId && args.documentId.trim() !== '') {
                     await adminDb.collection(args.collectionPath).doc(args.documentId).set(parsedData, { merge: true });
                     fResData = { success: true, id: args.documentId };
                   } else {
                     const added = await adminDb.collection(args.collectionPath).add(parsedData);
                     fResData = { success: true, id: added.id };
                   }
                } else if (callName === 'queryCollection') {
                   const docsSnap = await adminDb.collection(args.collectionPath).limit(50).get();
                   fResData = docsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
                } else {
                   fResData = { error: "Unknown function" };
                }
              } catch (e: any) {
                fResData = { error: String(e) };
              }

              chatContents.push({
                role: 'user', 
                parts: [{ 
                  functionResponse: {
                    name: callName,
                    response: fResData
                  }
                }]
              });
            } else {
              aiResponseText = response.text || 'Sin respuesta';
            }
          }

          const replyText = aiResponseText || 'Error generando respuesta con la IA.';

          await sock.sendPresenceUpdate('paused', remoteJid);
          await sock.sendMessage(remoteJid, { text: replyText });
          
          // Try to increment messagesUsed for the clinic in Firestore? We won't do it directly here but we can notify via an endpoint? 
          // Actually, we could just increment local state and require Firebase admin? No, we don't have Firebase admin setup here.
          // Let's just track it in the DB somehow, or rely on frontend? The easiest way is for frontend to track, or we fetch from DB?
          // Since we don't have firebase admin in server.ts, we'll assume there is an API or we might need firebase admin.
          // For now, let's just increment in memory if we are forced to. Or maybe the requirement doesn't strictly need backend enforcement. Let's increment in memory for now.
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

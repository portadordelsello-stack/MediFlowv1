import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { initializeApp, App } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { MercadoPagoConfig, Preference, PreApprovalPlan, PreApproval } from 'mercadopago';

// Initialize MP Client (Lazy creation logic inside endpoints where it's used so it doesn't crash without token)
let mpClient: MercadoPagoConfig | null = null;
function getMPClient() {
  if (!mpClient) {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (token) {
      mpClient = new MercadoPagoConfig({ accessToken: token });
    }
  }
  return mpClient;
}

// Initialize Firebase Admin (Lazy)
const firebaseAppConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

let adminApp: App | null = null;
let firestoreDb: any | null = null;

function getFirebaseAdmin() {
  if (!adminApp) {
    adminApp = initializeApp({
      projectId: firebaseAppConfig.projectId,
    });
  }
  return adminApp;
}

function getDb() {
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
    },
    prices: {
      BASICO: 4999,
      PREMIUM: 14999
    }
  };

  if (fs.existsSync(configPath)) {
     try {
       const savedData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
       const mergedLimits = { ...envConfig.limits, ...(savedData.limits || {}) };
       const mergedPrices = { ...envConfig.prices, ...(savedData.prices || {}) };
       return { ...envConfig, ...savedData, limits: mergedLimits, prices: mergedPrices };
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
                await appSnap.docs[0].ref.update({ status: 'CONFIRMED', updatedAt: FieldValue.serverTimestamp() });
              } else {
                // Create if it doesn't exist (though it should have been created by the portal or we can create it now)
                await appointmentsRef.add({
                  clinicOwnerId: clinicId,
                  patientId,
                  patientDni: dni,
                  date,
                  time,
                  status: 'CONFIRMED',
                  createdAt: FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp()
                });
              }
              
              await sock.sendMessage(remoteJid, { text: `¡Perfecto! Su turno para el ${date} a las ${time}h ha sido CONFIRMADO. ¡Lo esperamos!` });
              
              const clinicRef = getDb().collection('clinics').doc(clinicId);
              await clinicRef.update({ 
                messagesUsed: FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp() 
              });
              
              continue; // Skip AI generation for this message as it's handled
            }
          }

          const systemPrompt = clinicConfig.systemPrompt || "Eres un asistente virtual médico. Responde en español, sé sumamente cordial.";

          await sock.presenceSubscribe(remoteJid);
          await sock.sendPresenceUpdate('composing', remoteJid);
          
          const bookingUrl = `https://${host}/reservar/${clinicId}`;
          const consultarEstadoPaciente: FunctionDeclaration = {
            name: "consultarEstadoPaciente",
            description: "Consulta si el paciente está registrado y si tiene un turno pendiente usando su DNI. Úsalo siempre que el paciente te dé su DNI.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                dni: {
                  type: Type.STRING,
                  description: "El documento de identidad o DNI del paciente."
                }
              },
              required: ["dni"]
            }
          };

          const generationConfig = {
            systemInstruction: `Eres el agente inteligente de una clínica médica. El nombre de la clínica es "${clinicConfig.name}". Solo tienes tareas de soporte, agendamiento y respuestas a dudas generales. Sigue estas instrucciones: ${systemPrompt}. Si el paciente proporciona su DNI, usa la herramienta consultarEstadoPaciente para verificar si está registrado y si tiene turnos. Si tiene turno, recuérdale la fecha y hora. Si no lo tiene o no está registrado, indícale amablemente que puede agendar aquí: ${bookingUrl}\n\nIMPORTANTE PARA ENLACES: Al enviar el link, envíalo como texto crudo, SIN utilizar formato Markdown para enlaces (NO uses [texto](URL)). WhatsApp requiere que los links se envíen completos y sin envolver en otros caracteres para que sean clickeables.`,
            tools: [{ functionDeclarations: [consultarEstadoPaciente] }]
          };

          const response1 = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Mensaje del paciente: "${textMessage}"`,
            config: generationConfig
          });

          let replyText = 'Error generando respuesta.';

          if (response1.functionCalls && response1.functionCalls.length > 0) {
            const call = response1.functionCalls[0];
            if (call.name === 'consultarEstadoPaciente') {
              const dniArg = call.args.dni;
              let toolResultStr = "Error al consultar la base de datos.";
              
              if (typeof dniArg === 'string') {
                const patientsRef = getDb().collection('clinics').doc(clinicId).collection('patients');
                const patientSnap = await patientsRef.where('dni', '==', dniArg).limit(1).get();
                
                if (patientSnap.empty) {
                  toolResultStr = `Base de datos: El paciente con DNI ${dniArg} NO está en el sistema. Debe registrarse y sacar turno en el portal.`;
                } else {
                  const patientId = patientSnap.docs[0].id;
                  const patientData = patientSnap.docs[0].data();
                  
                  // Security Check: Match last 4 digits of WhatsApp phone vs Database phone
                  const incomingFull = remoteJid.split('@')[0];
                  const incomingClean = incomingFull.split(':')[0];
                  const incomingLast4 = incomingClean.slice(-4);
                  
                  const dbPhoneRaw = patientData.phone || '';
                  const dbPhoneStr = String(dbPhoneRaw);
                  const dbPhoneClean = dbPhoneStr.replace(/\D/g, '');
                  const dbPhoneLast4 = dbPhoneClean.slice(-4);

                  const logMsg = `[${new Date().toISOString()}] Security check for DNI ${dniArg}: incomingFull=${incomingFull}, incomingClean=${incomingClean}, incomingLast4=${incomingLast4}, dbPhoneRaw=${dbPhoneRaw}, dbPhoneClean=${dbPhoneClean}, dbPhoneLast4=${dbPhoneLast4}\n`;
                  console.log(logMsg);
                  import('fs').then(fs => fs.appendFileSync('wa_logs.txt', logMsg)).catch(console.error);

                  if (!dbPhoneLast4 || incomingLast4 !== dbPhoneLast4) {
                    toolResultStr = `ALERTA DE SEGURIDAD ESTRICTA: El número de WhatsApp del usuario no coincide con el registrado para el DNI suministrado. TIENES PROHIBIDO entregar información personal o de turnos. Responde indicando que por políticas de privacidad no puedes darle información y debe comunicarse directamente con la clínica.`;
                  } else {
                    const appointmentsRef = getDb().collection('clinics').doc(clinicId).collection('appointments');
                    // Consultar turnos futuros
                    const d = new Date();
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const todayStr = `${year}-${month}-${day}`;
                    const apptSnap = await appointmentsRef
                      .where('patientId', '==', patientId)
                      .where('date', '>=', todayStr)
                      .get();
                    
                    const validAppts = apptSnap.docs.filter((d: any) => d.data().status !== 'CANCELLED');
                    if (validAppts.length > 0) {
                      const sortedAppts = validAppts.sort((a: any, b: any) => a.data().date.localeCompare(b.data().date));
                      const appt = sortedAppts[0].data();
                      toolResultStr = `Base de datos: El paciente ${patientData.name || 'registrado'} tiene un turno CONFIRMADO el ${appt.date} a las ${appt.time}h.`;
                    } else {
                       toolResultStr = `Base de datos: El paciente ${patientData.name || 'registrado'} está registrado en el sistema pero NO tiene turnos pendientes. Ofrécele el portal de turnos para agendar.`;
                    }
                  }
                }
              }

              const previousContent = response1.candidates?.[0]?.content;
              if (previousContent) {
                const response2 = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: [
                    { role: 'user', parts: [{ text: `Mensaje del paciente: "${textMessage}"` }] },
                    previousContent,
                    { role: 'user', parts: [{ functionResponse: { name: 'consultarEstadoPaciente', response: { result: toolResultStr } } }] }
                  ],
                  config: generationConfig
                });
                replyText = response2.text || 'No pude encontrar la información, disculpa las molestias.';
              } else {
                replyText = 'Error en el flujo de la consulta. Por favor, intenta de nuevo.';
              }
            }
          } else {
            replyText = response1.text || 'Error generando respuesta.';
          }

          await sock.sendPresenceUpdate('paused', remoteJid);
          await sock.sendMessage(remoteJid, { text: replyText });
          
          // Increment messagesUsed in DB
          const clinicRef = getDb().collection('clinics').doc(clinicId);
          await clinicRef.update({ 
            messagesUsed: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp() 
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
   const { apiKey, projectId, location, limits, prices } = req.body;
   const existing = getSystemConfig();
   const newConfig = { ...existing, apiKey, projectId, location, limits: limits || existing.limits, prices: prices || existing.prices };
   fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
   initializeAI();
   res.json({ success: true });
});

// We need a way for regular clients to get the limits and prices
app.get('/api/system-limits', (req, res) => {
   const config = getSystemConfig();
   res.json({ limits: config.limits, prices: config.prices });
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

// Mercado Pago Routes
app.post('/api/mercadopago/create-preference', async (req, res) => {
  try {
    const client = getMPClient();
    if (!client) {
      return res.status(500).json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado' });
    }

    const { items, clinicId } = req.body;
    
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: items,
        metadata: {
          clinicId: clinicId
        },
        back_urls: {
          success: `${process.env.APP_URL || 'http://localhost:3000'}/panel/${clinicId}?status=success`,
          failure: `${process.env.APP_URL || 'http://localhost:3000'}/panel/${clinicId}?status=failure`,
          pending: `${process.env.APP_URL || 'http://localhost:3000'}/panel/${clinicId}?status=pending`
        },
        auto_return: 'approved'
      }
    });

    res.json({ id: result.id });
  } catch (error) {
    console.error("Error creating preference:", error);
    res.status(500).json({ error: 'Failed to create preference' });
  }
});

app.post('/api/mercadopago/create-subscription', async (req, res) => {
  try {
    const client = getMPClient();
    if (!client) {
      return res.status(500).json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado' });
    }

    const { reason, auto_recurring, back_url, payer_email } = req.body;
    
    const preApprovalPlan = new PreApprovalPlan(client);
    
    // We create a plan first
    const planResult = await preApprovalPlan.create({
      body: {
        reason: reason,
        auto_recurring: auto_recurring,
        back_url: back_url || `${process.env.APP_URL || 'http://localhost:3000'}`
      }
    });

    res.json({ init_point: planResult.init_point, plan_id: planResult.id });
  } catch (error: any) {
    console.error("Error creating subscription plan:", JSON.stringify(error, null, 2));
    res.status(500).json({ error: 'Failed to create subscription plan', details: error?.message || error?.response || error });
  }
});

app.post('/api/mercadopago/webhook', async (req, res) => {
  try {
    const { action, data, type } = req.body;
    console.log("Mercado Pago Webhook Received:", { action, type, data });
    
    // 1. Verify webhook signature if needed using MERCADOPAGO_WEBHOOK_SECRET
    // 2. Fetch the subscription or payment from MP SDK using data.id
    // 3. Update the clinic record in Firestore:
    // e.g. getDb().collection('clinics').where('subscriptionId', '==', ...).update({ plan: 'PREMIUM' })
    
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err);
    res.sendStatus(500);
  }
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

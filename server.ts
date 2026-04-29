import express from 'express';
import { createServer as createViteServer } from 'vite';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { Boom } from '@hapi/boom';
import pino from 'pino';

// Initialize AI if API key is present in ENV
const defaultAi = (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') 
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) 
  : null;

if (!defaultAi) {
  console.warn("WARNING: GEMINI_API_KEY is missing in env. Server will fallback to globalSettings API Key on demand.");
}

const PORT = 3000;
const app = express();
app.use(express.json());

interface AppConfig {
  botActive: boolean;
  systemPrompt: string;
  name: string;
  appointments?: any[];
  domain?: string;
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
  const { version, isLatest } = await fetchLatestBaileysVersion();
  
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
      console.log(`WhatsApp connection for ${clinicId} closed. Reason: ${statusCode}, Reconnecting: ${shouldReconnect}`);
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
      console.log(`WhatsApp connection for ${clinicId} OPEN!`);
      waStatus.set(clinicId, 'CONNECTED');
      waQRCodes.delete(clinicId);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    for (const msg of m.messages) {
      if (!msg.message || msg.key.fromMe) continue;
      
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) continue; // Skip groups and statuses
      
      const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!textMessage) continue;

      console.log(`[${clinicId}] Message from ${remoteJid}: ${textMessage}`);

      const clinicConfig = waConfigs.get(clinicId);
      if (!clinicConfig || !clinicConfig.botActive) {
        console.log(`[${clinicId}] Bot is disabled or missing config. Ignoring message.`);
        continue;
      }

      let ai = defaultAi;
      if (!ai) {
         try {
            const configPath = path.join(process.cwd(), 'wa_clients', 'gemini_key.txt');
            if (fs.existsSync(configPath)) {
               const savedKey = fs.readFileSync(configPath, 'utf-8').trim();
               if (savedKey) {
                  ai = new GoogleGenAI({ apiKey: savedKey });
               }
            }
         } catch (e) {
            console.error("Error fetching local config:", e);
         }
      }

      if (!ai) {
          const errorMsg = 'Error interno: La llave de API (API Key) de Gemini no es válida o no se ha configurado. Por favor, revisa la sección Administrador.';
          await sock.sendMessage(remoteJid, { text: errorMsg });
          continue;
      }

      try {
        const systemPrompt = clinicConfig.systemPrompt || "Eres un asistente virtual médico. Responde en español, sé sumamente cordial.";

        await sock.presenceSubscribe(remoteJid);
        await sock.sendPresenceUpdate('composing', remoteJid);
        
        let customIntercept = false;
        let replyText = '';
        const lowerMsg = textMessage.toLowerCase();
        
        // Manual verification logic instead of asking AI to verify
        if (lowerMsg.includes('he agendado mi turno para el')) {
           const match = textMessage.match(/(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})/);
           if (match) {
             const [_, dateMatch, timeMatch] = match;
             const exists = (clinicConfig.appointments || []).find((a: any) => a.date === dateMatch && a.time === timeMatch);
             if (exists) {
               replyText = "Su turno ha sido confirmado, lo esperamos.";
               customIntercept = true;
               
               // Optionally call the webhook / update locally
             }
           }
        }

        if (!customIntercept) {
           const dbContext = `\n\nAquí tienes la lista de citas (turnos) guardadas en la base de datos de la clínica actualmente: ${JSON.stringify(clinicConfig.appointments || [])}.
           \n\nRegla estricta: Si un paciente te pide un turno, una consulta o agendar una cita, DEBES obligatoriamente responderle indicándole que ingrese a este link para escoger su horario: ${clinicConfig.domain}/book/${clinicId}
           IMPORTANTE: Entrega el link en formato de texto plano y crudo. NO uses formato interactivo o markdown como [texto](link).`;

           const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: `Mensaje del paciente: "${textMessage}"`,
             config: {
                systemInstruction: `Eres el agente inteligente de una clínica médica. El nombre de la clínica es "${clinicConfig.name}". Solo tienes tareas de soporte, agendamiento y respuestas a dudas generales. Sigue estas instrucciones: ${systemPrompt}${dbContext}`
             }
           });
           replyText = response.text || 'Error generando respuesta.';
        }
        
        await sock.sendPresenceUpdate('paused', remoteJid);
        await sock.sendMessage(remoteJid, { text: replyText });
      } catch (err: any) {
        console.error("AI Error:", err);
        await sock.sendPresenceUpdate('paused', remoteJid);
        
        let errorMsg = 'Lo siento, estoy teniendo problemas técnicos en este momento.';
        if (err?.message?.includes('API key not valid')) {
          errorMsg = 'Error interno: La llave de API (API Key) de Gemini no es válida o no se ha configurado. Por favor, revisa la configuración en el panel de Secrets de tu aplicación.';
        }

        await sock.sendMessage(remoteJid, { text: errorMsg });
      }
    }
  });

  waClients.set(clinicId, sock);
}

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

app.post('/api/admin/config', async (req, res) => {
  const { apiKey } = req.body;
  if (apiKey !== undefined) {
    const configPath = path.join(process.cwd(), 'wa_clients', 'gemini_key.txt');
    if (!fs.existsSync(path.dirname(configPath))) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    fs.writeFileSync(configPath, apiKey);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Missing apiKey' });
  }
});

app.post('/api/simulate', async (req, res) => {
  const { messages, systemPrompt, clinicName } = req.body;
  if (!messages) return res.status(400).json({ error: 'messages is required' });

  let ai = defaultAi;
  if (!ai) {
     try {
        const configPath = path.join(process.cwd(), 'wa_clients', 'gemini_key.txt');
        if (fs.existsSync(configPath)) {
           const savedKey = fs.readFileSync(configPath, 'utf-8').trim();
           if (savedKey) {
              ai = new GoogleGenAI({ apiKey: savedKey });
           }
        }
     } catch (e) {
        console.error("Error fetching local config:", e);
     }
  }

  if (!ai) {
     return res.status(500).json({ error: 'La llave de API (API Key) de Gemini no se ha configurado. Pidele al administrador que la configure.' });
  }

  try {
    const contents = messages.map((m: any) => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: systemPrompt || `Eres un asistente virtual para la ${clinicName || 'clínica'}.`
      }
    });

    res.json({ text: response.text || '' });
  } catch (err: any) {
    console.error("Simulation Error:", err);
    res.status(500).json({ error: err.message || 'Error en la simulación' });
  }
});

app.post('/api/whatsapp/config', (req, res) => {
  const { clinicId, botActive, systemPrompt, name, appointments = [], domain } = req.body;
  if (!clinicId) return res.status(400).json({ error: 'clinicId is required' });
  
  waConfigs.set(clinicId, {
     botActive: !!botActive,
     systemPrompt: systemPrompt || '',
     name: name || 'Clínica',
     domain: domain || 'http://localhost:3000',
     appointments
  });
  res.json({ success: true });
});

app.get('/api/whatsapp/status/:clinicId', (req, res) => {
  const { clinicId } = req.params;
  const status = waStatus.get(clinicId) || 'DISCONNECTED';
  const qr = waQRCodes.get(clinicId) || null;
  
  res.json({ status, qr });
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

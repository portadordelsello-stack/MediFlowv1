import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';

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

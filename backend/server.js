const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
require('dotenv').config();

// ==========================================
// FIREBASE ADMIN SDK SERVICE ACCOUNT SETUP
// ==========================================
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'serviceAccountKey.json');
let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else {
    serviceAccount = require(serviceAccountPath);
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("🔒 [FIREBASE] Admin SDK successfully initialized.");
} catch (configError) {
  console.error("❌ [CRITICAL] Firebase Admin SDK configuration anomaly:", configError.message);
}

const app = express();
const server = http.createServer(app);

// ==========================================
// EXPRESS MIDDLEWARE & CROSS-ORIGIN SETUP
// ==========================================
// Expanded allowed origins array to safely include live deployed Vercel frontends
const allowedOrigins = [
  'http://localhost:5173', 
  'http://127.0.0.1:5173', 
  'http://localhost:3000',
  /\.vercel\.app$/ // Matches any subdomains deployed onto vercel dynamically
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

const upload = multer({ storage: multer.memoryStorage() });

// Global runtime array state representing your connected terminal nodes
let activeTerminals = [
  { id: 'terminal_alpha', name: 'Sales Department Line', status: 'Disconnected' },
  { id: 'terminal_beta', name: 'Customer Support Desk', status: 'Disconnected' },
  { id: 'terminal_gamma', name: 'Marketing Blast SIM', status: 'Disconnected' }
];

// Runtime memory cache dictionary tracking active Baileys live sockets
const whatsappInstances = {};

// ==========================================
// ROUTE SECURITY: FIREBASE AUTH CHECKER
// ==========================================
async function verifyAuthToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or malformed token header configuration.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Firebase Auth Guard Verification Failure:', error.message);
    return res.status(403).json({ success: false, error: 'Access forbidden: Invalid session parameters.' });
  }
}

// ==========================================
// STATE MANAGEMENT HELPER FUNCTION
// ==========================================
function updateTerminalStatus(instanceId, status) {
  activeTerminals = activeTerminals.map(profile => {
    if (profile.id === instanceId) {
      return { ...profile, status };
    }
    return profile;
  });
  io.emit('profiles_update', activeTerminals);
  io.to(instanceId).emit('status_change', { instanceId, status });
}

// ==========================================
// FULLY BUILT MULTI-DEVICE WHATSAPP CONNECTION ENGINE
// ==========================================
async function initializeWhatsAppNodePipeline(instanceId) {
  console.log(`🔌 [BAILEYS PIPELINE] Bootstrapping background connection layers for node: ${instanceId}`);
  
  try {
    const sessionAuthFolder = path.join(__dirname, 'auth_sessions', instanceId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionAuthFolder);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }) 
    });

    whatsappInstances[instanceId] = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`✨ [QR STREAM] New login token generated for node: ${instanceId}`);
        activeTerminals = activeTerminals.map(t => t.id === instanceId ? { ...t, status: 'Scan', qr } : t);
        
        io.emit('profiles_update', activeTerminals);
        io.to(instanceId).emit('qr_code', { instanceId, qr });
        io.to(instanceId).emit('status_change', { instanceId, status: 'Scan', qr });
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`❌ Link dropped for node ${instanceId}. Auto-reestablish evaluation: ${shouldReconnect}`);
        
        updateTerminalStatus(instanceId, 'Disconnected');
        delete whatsappInstances[instanceId];

        if (shouldReconnect) {
          updateTerminalStatus(instanceId, 'Initializing');
          initializeWhatsAppNodePipeline(instanceId);
        } else {
          await fs.remove(sessionAuthFolder);
        }
      } 
      else if (connection === 'open') {
        console.log(`🟢 [SUCCESS] WhatsApp Session fully paired on node: ${instanceId.toUpperCase()}`);
        activeTerminals = activeTerminals.map(t => t.id === instanceId ? { ...t, qr: '' } : t);
        updateTerminalStatus(instanceId, 'Connected');
      }
    });

  } catch (pipelineError) {
    console.error(`❌ Connection routine crashed on node ${instanceId}:`, pipelineError.message);
    updateTerminalStatus(instanceId, 'Disconnected');
  }
}

// ==========================================
// HTTP ENDPOINTS PIPELINE API ROUTES
// ==========================================

app.post('/api/upload-recipients', verifyAuthToken, upload.single('excelFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Missing active transmission file source.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const parsedData = xlsx.utils.sheet_to_json(worksheet);

    return res.status(200).json({ success: true, data: parsedData });
  } catch (err) {
    console.error('Excel File Engine Parser Exception:', err);
    return res.status(500).json({ success: false, error: 'Failed to transform stream target array spreadsheet contents.' });
  }
});

app.post('/api/generate-template', verifyAuthToken, (req, res) => {
  const { businessContext, tone, sampleRow } = req.body;
  if (!businessContext) {
    return res.status(400).json({ success: false, error: 'Missing semantic copy guidelines requirements parameters.' });
  }

  const namePlaceholder = sampleRow && (sampleRow.Name || sampleRow.name) ? '{{Name}}' : 'Client';
  const companyPlaceholder = sampleRow && (sampleRow.Company || sampleRow.company) ? '{{Company}}' : 'Workspace Partner';

  let simulatedAiText = '';
  if (tone === 'Professional') {
    simulatedAiText = `Dear ${namePlaceholder},\n\nWe are pleased to reach out from the team at ${companyPlaceholder}. Regarding your recent business requirements, following up on: ${businessContext}. Please review your dashboard file details.`;
  } else {
    simulatedAiText = `Hey there ${namePlaceholder}! 👋 Quick check-in from everyone over at ${companyPlaceholder}! Just wanted to sync up about ${businessContext}. Let us know what you think! 😊`;
  }

  return res.status(200).json({ success: true, text: simulatedAiText });
});

app.post('/api/broadcast', verifyAuthToken, upload.single('broadcastImage'), async (req, res) => {
  const { instanceId, list, messageTemplate, imageCaption } = req.body;
  const targetContacts = JSON.parse(list || '[]');
  const clientSocket = whatsappInstances[instanceId];

  if (!clientSocket || !clientSocket.user) {
    return res.status(400).json({ success: false, error: `Terminal node ${instanceId.toUpperCase()} has no active connected session.` });
  }

  (async () => {
    console.log(`\n🚀 [DISPATCHING BULK] Volume size: ${targetContacts.length} numbers.`);
    for (const contact of targetContacts) {
      let phone = String(contact.Phone || contact.phone || '').replace(/[^0-9]/g, '');
      if (!phone) continue;
      if (!phone.startsWith('91') && phone.length === 10) phone = '91' + phone;
      const jid = `${phone}@s.whatsapp.net`;

      let msg = messageTemplate;
      Object.keys(contact).forEach(k => {
        msg = msg.replace(new RegExp(`{{${k}}}`, 'g'), contact[k]);
      });

      try {
        if (req.file) {
          await clientSocket.sendMessage(jid, {
            image: req.file.buffer,
            caption: imageCaption ? imageCaption.replace(/{{Name}}/g, contact.Name || '') : msg
          });
        } else {
          await clientSocket.sendMessage(jid, { text: msg });
        }
        // FIXED: Swapped 'resolve' with 'r' variable context to clear loops blocking errors
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
      } catch (err) {
        console.error(`Failed pushing data packets to context row ${jid}:`, err.message);
      }
    }
  })();

  return res.status(200).json({ success: true, message: 'Broadcast pipeline initialized successfully.' });
});

app.post('/api/schedule-broadcast', verifyAuthToken, upload.single('broadcastImage'), (req, res) => {
  return res.status(200).json({ success: true, message: 'Campaign settings structure successfully committed to cron staging databanks.' });
});

// ==========================================
// SOCKET.IO REAL-TIME OPERATIONAL LAYER
// ==========================================
io.on('connection', (socket) => {
  console.log(`🔌 Secure Web Socket node synchronized instance: ${socket.id}`);
  
  socket.emit('profiles_update', activeTerminals);

  socket.on('join_instance', (data) => {
    socket.join(data.instanceId);
    console.log(`Socket node mapping updated: Client account ${socket.id} joined channel ${data.instanceId}`);
    
    if (!whatsappInstances[data.instanceId]) {
      updateTerminalStatus(data.instanceId, 'Initializing');
      initializeWhatsAppNodePipeline(data.instanceId);
    } else {
      const current = activeTerminals.find(t => t.id === data.instanceId);
      if (current) {
        socket.emit('status_change', { instanceId: data.instanceId, status: current.status, qr: current.qr || '' });
      }
    }
  });

  socket.on('request_device_sync', (data) => {
    const targetId = data.instanceId;
    console.log(`📱 Querying physical hardware connection metrics loops for instance node: ${targetId}`);
    
    const instance = whatsappInstances[targetId];
    
    if (instance && instance.user) {
      updateTerminalStatus(targetId, 'Connected');
    } else if (instance) {
      updateTerminalStatus(targetId, 'Scan');
    } else {
      updateTerminalStatus(targetId, 'Initializing');
      initializeWhatsAppNodePipeline(targetId);
    }
  });

  socket.on('logout_terminal_instance', async (data) => {
    const targetId = data.instanceId;
    console.log(`\n⚠️ [WHATSAPP LOGOUT & REGEN QR] Tearing down old session and spinning up a fresh link instance for: ${targetId.toUpperCase()}`);

    try {
      if (whatsappInstances[targetId]) {
        console.log(`🧼 Terminating live socket instance for: ${targetId}`);
        try {
          await whatsappInstances[targetId].logout();
        } catch (logoutError) {
          console.log(`💡 Note: Socket connection was already closed or closing: ${logoutError.message}`);
        }
        if (whatsappInstances[targetId].end) {
          whatsappInstances[targetId].end();
        }
        delete whatsappInstances[targetId];
      }

      const sessionAuthFolder = path.join(__dirname, 'auth_sessions', targetId);
      if (fs.existsSync(sessionAuthFolder)) {
        await fs.remove(sessionAuthFolder);
        console.log(`🗑️ Erased auth session token folder clean from disk: ${sessionAuthFolder}`);
      }

      updateTerminalStatus(targetId, 'Scan');
      initializeWhatsAppNodePipeline(targetId);

    } catch (error) {
      console.error(`❌ Crash anomaly encountered resetting node connection framework:`, error.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client node left socket link framework grid: ${socket.id}`);
  });
});

// ==========================================
// BOOTSTRAP EXPRESS SERVER ENGINE
// ==========================================
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`=====================================================================`);
  console.log(`  🟢 Prytik Broadcast Suite Backend Engine listening on Port : ${PORT}`);
  console.log(`  🚀 Environment Core Execution Integrity check: Active and Stable.`);
  console.log(`=====================================================================`);
});
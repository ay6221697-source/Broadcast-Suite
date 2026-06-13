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

// ── FIREBASE ADMIN ────────────────────────────────────────────────────────────
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'serviceAccountKey.json');
try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log("🔒 [FIREBASE] Admin SDK initialized.");
} catch (e) {
  console.error("❌ [CRITICAL] Firebase Admin init error:", e.message);
}

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  /\.vercel\.app$/
];

app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true }));
app.use(express.json());

const io = new Server(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] } });
const upload = multer({ storage: multer.memoryStorage() });

let activeTerminals = [
  { id: 'terminal_alpha', name: 'Sales Department Line', status: 'Disconnected' },
  { id: 'terminal_beta', name: 'Customer Support Desk', status: 'Disconnected' },
  { id: 'terminal_gamma', name: 'Marketing Blast SIM', status: 'Disconnected' }
];

const whatsappInstances = {};

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
async function verifyAuthToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  try {
    req.user = await admin.auth().verifyIdToken(authHeader.split(' ')[1]);
    next();
  } catch (e) {
    return res.status(403).json({ success: false, error: 'Invalid session.' });
  }
}

// ── STATUS HELPER ─────────────────────────────────────────────────────────────
function updateTerminalStatus(instanceId, status, extra = {}) {
  activeTerminals = activeTerminals.map(t =>
    t.id === instanceId ? { ...t, status, ...extra } : t
  );
  io.emit('profiles_update', activeTerminals);
  io.to(instanceId).emit('status_change', { instanceId, status, ...extra });
}

// ── BAILEYS CONNECTION ENGINE ─────────────────────────────────────────────────
async function initializeWhatsAppNodePipeline(instanceId) {
  console.log(`🔌 [BAILEYS] Starting node: ${instanceId}`);
  try {
    const sessionFolder = path.join(__dirname, 'auth_sessions', instanceId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

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
        activeTerminals = activeTerminals.map(t =>
          t.id === instanceId ? { ...t, status: 'Scan', qr } : t
        );
        io.emit('profiles_update', activeTerminals);
        io.to(instanceId).emit('qr_code', { instanceId, qr });
        io.to(instanceId).emit('status_change', { instanceId, status: 'Scan', qr });
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        updateTerminalStatus(instanceId, 'Disconnected');
        delete whatsappInstances[instanceId];
        if (shouldReconnect) {
          updateTerminalStatus(instanceId, 'Initializing');
          initializeWhatsAppNodePipeline(instanceId);
        } else {
          await fs.remove(sessionFolder);
        }
      }

      if (connection === 'open') {
        console.log(`🟢 [SUCCESS] Node paired: ${instanceId}`);
        activeTerminals = activeTerminals.map(t =>
          t.id === instanceId ? { ...t, qr: '' } : t
        );
        updateTerminalStatus(instanceId, 'Connected');
      }
    });
  } catch (e) {
    console.error(`❌ Node ${instanceId} pipeline crash:`, e.message);
    updateTerminalStatus(instanceId, 'Disconnected');
  }
}

// ── HTTP ROUTES ───────────────────────────────────────────────────────────────

app.post('/api/upload-recipients', verifyAuthToken, upload.single('excelFile'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    return res.json({ success: true, data });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Failed to parse file.' });
  }
});

app.post('/api/generate-template', verifyAuthToken, (req, res) => {
  const { businessContext, tone, sampleRow } = req.body;
  if (!businessContext) return res.status(400).json({ success: false, error: 'Context required.' });
  const name = sampleRow?.Name ? '{{Name}}' : 'Client';
  const company = sampleRow?.Company ? '{{Company}}' : 'Your Company';
  const text = tone === 'Professional'
    ? `Dear ${name},\n\nWe are reaching out from ${company} regarding: ${businessContext}.\n\nPlease review the details at your earliest convenience.`
    : `Hey ${name}! 👋 Quick message from ${company}! Just wanted to connect about: ${businessContext}. Let us know! 😊`;
  return res.json({ success: true, text });
});

// ── BROADCAST: image via multer memoryStorage buffer ─────────────────────────
app.post('/api/broadcast', verifyAuthToken, upload.single('broadcastImage'), async (req, res) => {
  const { instanceId, list, messageTemplate, imageCaption } = req.body;

  let targetContacts;
  try { targetContacts = JSON.parse(list || '[]'); } catch { return res.status(400).json({ success: false, error: 'Invalid list.' }); }

  const sock = whatsappInstances[instanceId];
  if (!sock || !sock.user)
    return res.status(400).json({ success: false, error: `Node ${instanceId} not connected.` });

  // Respond immediately so UI doesn't hang
  res.json({ success: true, message: 'Broadcast pipeline initialized.' });

  const imageBuffer = req.file ? req.file.buffer : null;
  const imageMimeType = req.file ? req.file.mimetype : null;

  console.log(`🚀 [BROADCAST] ${targetContacts.length} contacts | image: ${imageBuffer ? 'YES' : 'NO'}`);

  for (const contact of targetContacts) {
    let phone = String(contact.Phone || contact.phone || '').replace(/[^0-9]/g, '');
    if (!phone) continue;
    if (!phone.startsWith('91') && phone.length === 10) phone = '91' + phone;
    const jid = `${phone}@s.whatsapp.net`;

    // Personalise message
    let msg = messageTemplate;
    Object.keys(contact).forEach(k => { msg = msg.replace(new RegExp(`{{${k}}}`, 'g'), contact[k]); });

    // Personalise caption
    let caption = imageCaption || msg;
    Object.keys(contact).forEach(k => { caption = caption.replace(new RegExp(`{{${k}}}`, 'g'), contact[k]); });

    try {
      if (imageBuffer) {
        // FIX: send image using in-memory buffer — no disk I/O needed with memoryStorage
        await sock.sendMessage(jid, {
          image: imageBuffer,
          mimetype: imageMimeType || 'image/jpeg',
          caption
        });
        // If there's also a separate text message body, send as follow-up bubble
        if (imageCaption && msg && msg !== imageCaption) {
          await new Promise(r => setTimeout(r, 600));
          await sock.sendMessage(jid, { text: msg });
        }
      } else {
        await sock.sendMessage(jid, { text: msg });
      }
      console.log(`✅ Sent to ${jid}`);
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
    } catch (e) {
      console.error(`❌ Failed ${jid}:`, e.message);
    }
  }
  console.log(`✅ [BROADCAST COMPLETE]`);
});

// ── SCHEDULE BROADCAST ────────────────────────────────────────────────────────
app.post('/api/schedule-broadcast', verifyAuthToken, upload.single('broadcastImage'), (req, res) => {
  // Store image as base64 string in job so cron runner can send it later
  const imageBase64 = req.file ? req.file.buffer.toString('base64') : null;
  const imageMimeType = req.file ? req.file.mimetype : null;
  // (Extend scheduledJobs logic here as needed)
  return res.json({ success: true, message: 'Campaign committed to queue.' });
});

// ── SOCKET.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  socket.emit('profiles_update', activeTerminals);

socket.on('join_instance', ({ instanceId }) => {
    socket.join(instanceId);
    
    const current = activeTerminals.find(t => t.id === instanceId);
    const sock = whatsappInstances[instanceId];

    // FIX: Agar background socket already active aur connected hai, toh persistent 'Connected' status hi rakho
    if (sock && sock.user) {
      updateTerminalStatus(instanceId, 'Connected');
      socket.emit('status_change', { instanceId, status: 'Connected', qr: '' });
    } else if (sock) {
      // Agar socket workflow running hai par scanning loop state me hai
      socket.emit('status_change', { instanceId, status: current?.status || 'Scan', qr: current?.qr || '' });
    } else {
      // Sirf tabhi Initializing dikhao jab instance backend memory me exist hi na karta ho
      updateTerminalStatus(instanceId, 'Initializing');
      initializeWhatsAppNodePipeline(instanceId);
    }
  });

  // FIX: request_device_sync — check real socket state and emit device_sync_result back
  socket.on('request_device_sync', async ({ instanceId }) => {
    console.log(`🔄 [SYNC REQUEST] Checking node: ${instanceId}`);
    const sock = whatsappInstances[instanceId];

    if (sock && sock.user) {
      // Already connected — just confirm
      updateTerminalStatus(instanceId, 'Connected');
      socket.emit('device_sync_result', { instanceId, status: 'Connected' });
    } else if (sock) {
      // Socket exists but not fully authenticated — still scanning
      const current = activeTerminals.find(t => t.id === instanceId);
      const currentStatus = current?.status || 'Scan';
      socket.emit('device_sync_result', { instanceId, status: currentStatus });
      // Re-emit QR if available
      if (current?.qr) socket.emit('qr_code', { instanceId, qr: current.qr });
    } else {
      // No socket at all — restart the pipeline and wait for QR
      console.log(`🔁 [SYNC] No active socket for ${instanceId} — restarting pipeline.`);
      updateTerminalStatus(instanceId, 'Initializing');
      socket.emit('device_sync_result', { instanceId, status: 'Initializing' });
      await initializeWhatsAppNodePipeline(instanceId);
    }
  });

  socket.on('logout_terminal_instance', async ({ instanceId }) => {
    console.log(`⚠️ [LOGOUT] Resetting node: ${instanceId}`);
    try {
      if (whatsappInstances[instanceId]) {
        try { await whatsappInstances[instanceId].logout(); } catch {}
        try { whatsappInstances[instanceId].end?.(); } catch {}
        delete whatsappInstances[instanceId];
      }
      const sessionFolder = path.join(__dirname, 'auth_sessions', instanceId);
      if (fs.existsSync(sessionFolder)) await fs.remove(sessionFolder);
      updateTerminalStatus(instanceId, 'Scan');
      initializeWhatsAppNodePipeline(instanceId);
    } catch (e) {
      console.error(`❌ Logout error for ${instanceId}:`, e.message);
    }
  });

  socket.on('disconnect', () => console.log(`❌ Socket disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`=====================================================================`);
  console.log(`  🟢 Prytik Broadcast Suite running on port: ${PORT}`);
  console.log(`=====================================================================`);
});
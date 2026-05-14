require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const initSocket = require('./socket');

const app = express();
const server = http.createServer(app);

// ── CORS — manual preflight + middleware ──────────────────────────
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

// Handle preflight manually — no app.options, no wildcard
app.use(function (req, res, next) {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,ngrok-skip-browser-warning");

  // Respond to preflight immediately
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ── Socket.io ─────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set('io', io);
initSocket(io);

// ── Database ──────────────────────────────────────────────────────
connectDB();

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use('/api/wallet/webhook', express.raw({ type: 'application/json' }));

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/deliveries', require('./routes/delivery'));
app.use('/api/drivers',    require('./routes/driver'));
app.use('/api/wallet',     require('./routes/wallet'));
app.use('/api/users', require('./routes/user'));
app.use('/api/wallet', require('./routes/wallet'));
// src/app.js
app.use('/api/chat', require('./routes/chat'));
app.post('/api/webhook/paystack', express.raw({ type: '*/*' }), require('./controllers/walletController').paystackWebhook);

// ── Health check ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Pickar API is running',
    version: '1.0.0',
  });
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Server Error',
  });
});

// ── 404 handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ── Start server ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
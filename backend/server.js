// backend/server.js
// Entry point. Loads env vars, connects to MongoDB, mounts API routes,
// and serves the frontend + admin folders as static sites — so the whole
// project runs from a single `npm start`.
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const asyncHandler = require('./middleware/asyncHandler');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  ...(process.env.APP_URL ? [new URL(process.env.APP_URL).origin] : []),
  ...String(process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean),
]);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS.');
    error.status = 403;
    return callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));
app.use(express.json({ limit: '100kb' }));

// --- API ---
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('API request failed:', err.message);
  res.status(err.status || 500).json({ error: 'The request could not be completed.' });
});

// --- Static sites ---
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

async function start() {
  await connectDB();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Brew & Bean running at http://localhost:${PORT}`);
    console.log(`Admin dashboard at    http://localhost:${PORT}/admin`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Identify its owner before stopping it, or set a different PORT in .env.`);
    } else {
      console.error('Brew & Bean server failed to start:', err.message);
    }
    process.exitCode = 1;
  });
}

start();

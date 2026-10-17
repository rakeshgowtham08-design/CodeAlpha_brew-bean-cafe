// backend/server.js
// Entry point. Loads env vars, connects to MongoDB, mounts API routes,
// and serves the frontend + admin folders as static sites — so the whole
// project runs from a single `npm start`.
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// --- API ---
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

// --- Static sites ---
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/', express.static(path.join(__dirname, '..', 'frontend')));

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Brew & Bean running at http://localhost:${PORT}`);
    console.log(`Admin dashboard at    http://localhost:${PORT}/admin`);
  });
}

start();

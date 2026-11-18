require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const menuRoutes = require('./routes/menuRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const rewardRoutes = require('./routes/rewardRoutes');

// ─── Connect to MongoDB + auto-seed if empty ──────────────────────────────────
const autoSeed = async () => {
  await connectDB();
  // Seed only when the menu collection is empty (first run or in-memory)
  const MenuItem = require('./models/MenuItem');
  const User     = require('./models/User');
  const count    = await MenuItem.countDocuments();
  if (count === 0) {
    console.log('🌱 No menu items found — running auto-seed…');
    try {
      const seedModule = require('./seed');
      const seedFn = typeof seedModule === 'function' ? seedModule : seedModule.runSeed;
      if (typeof seedFn === 'function') await seedFn();
    } catch (_) {
      // seed.js calls process.exit itself — that's fine for standalone runs;
      // when imported it just needs to export the logic. We wrap in try/catch.
    }
  } else {
    // Check if any existing items are missing Healthy Indian dishes or new fields
    try {
      const healthyCount = await MenuItem.countDocuments({ category: 'Healthy Indian' });
      if (count < 40 || healthyCount < 10) {
        console.log(`🥗 Syncing menu items (Healthy Indian category & allergen/ingredient data)…`);
        const { seedUpdate } = require('./seed');
        if (typeof seedUpdate === 'function') await seedUpdate(true);
      }
    } catch (_) {}
  }
};
autoSeed();

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = express();

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Serve Static Client Files ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../client')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rewards', rewardRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Cafeteria Food Ordering API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── Serve Frontend Pages (SPA fallback) ──────────────────────────────────────
// Any non-API GET request serves the relevant HTML page or falls back to index
app.get(/^\/(?!api).*/, (req, res) => {
  const urlPath = req.path;

  // Map URL paths to HTML files
  const pageMap = {
    '/': 'index.html',
    '/menu': 'pages/menu.html',
    '/cart': 'pages/cart.html',
    '/checkout': 'pages/checkout.html',
    '/track': 'pages/track.html',
    '/rewards': 'pages/rewards.html',
    '/profile': 'pages/profile.html',
    '/login': 'pages/login.html',
    '/register': 'pages/register.html',
    '/admin': 'pages/admin.html',
    '/admin/orders': 'pages/admin.html',
    '/admin/menu': 'pages/admin.html',
  };

  const filePath = pageMap[urlPath] || 'index.html';
  res.sendFile(path.join(__dirname, '../client', filePath));
});

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Server running in ${process.env.NODE_ENV} mode on http://localhost:${PORT}`);
  console.log(`📋 API health check: http://localhost:${PORT}/api/health\n`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

module.exports = app;

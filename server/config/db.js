const mongoose = require('mongoose');

let _memServer = null; // hold reference so we can stop it on exit

const connectDB = async () => {
  try {
    let uri = process.env.MONGO_URI;

    // ── In-memory fallback when no local MongoDB is available ─────────────────
    if (!uri || uri.includes('localhost') || uri.includes('127.0.0.1')) {
      try {
        // Quick probe: can we reach the URI?
        await mongoose.connect(uri, {
          serverSelectionTimeoutMS: 2000,
          useNewUrlParser: true,
          useUnifiedTopology: true,
        });
        console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
        return;
      } catch (_) {
        console.warn('⚠️  Local MongoDB not found — starting in-memory server…');
        const { MongoMemoryServer } = require('mongodb-memory-server');
        _memServer = await MongoMemoryServer.create();
        uri = _memServer.getUri();
        console.log('✅ In-memory MongoDB started');
      }
    }

    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

// Expose so seed.js can trigger the same path
connectDB.getMemServer = () => _memServer;

// Log disconnect events
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

module.exports = connectDB;

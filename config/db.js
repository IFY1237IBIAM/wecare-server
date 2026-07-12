/**
 * config/db.js — WITH CONNECTION POOL TUNING
 *
 * Default Mongoose pool size is 5 connections.
 * Under real load with 1000 users this exhausts quickly since each
 * concurrent request holds a connection while awaiting a DB response.
 *
 * Pool tuned for Render's free/starter tier (single dyno, 512MB RAM):
 *   maxPoolSize: 10  — max 10 simultaneous DB connections
 *   minPoolSize: 2   — keep 2 warm so cold requests don't wait
 *   serverSelectionTimeoutMS: 5000 — fail fast if Atlas is unreachable
 *   socketTimeoutMS: 45000         — close idle sockets after 45s
 */

const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize:              10,
      minPoolSize:              2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS:          45000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
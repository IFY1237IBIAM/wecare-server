import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import xss from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import connectDB from './src/config/db.js';
import authRoutes from './src/routes/auth.js';
import postsRoutes from './src/routes/post.js';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(xss());
app.use(mongoSanitize());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

connectDB();

// Serve uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(500).json({ message: 'Server error' });
});

/* ================= SOCKET.IO ================= */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"],
  },
});

// Make io accessible in routes
app.set("io", io);

io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

/* ============================================ */

const PORT = process.env.PORT || 4000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

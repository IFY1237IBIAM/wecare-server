const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { runCleanup } = require("./utils/cleanupJob");
const connectDB = require("./config/db");
const emailRoutes = require("./routes/emailRoutes");

dotenv.config();
connectDB();
// Run cleanup once on startup then every 24 hours
runCleanup();
setInterval(runCleanup, 24 * 60 * 60 * 1000);
const app = express();
const httpServer = http.createServer(app);

// Socket.IO initialization
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Attach io to every request so controllers can emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Socket.IO connection handling ──
io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  socket.on("join_post", (postId) => {
    if (!postId) return;
    socket.join(`post:${postId}`);
    console.log(`📌 ${socket.id} joined post:${postId}`);
  });

  socket.on("leave_post", (postId) => {
    if (!postId) return;
    socket.leave(`post:${postId}`);
    console.log(`📤 ${socket.id} left post:${postId}`);
  });

  socket.on("join_group", (groupId) => {
    if (!groupId) return;
    socket.join(`group:${groupId}`);
    console.log(`👥 ${socket.id} joined group:${groupId}`);
  });

  socket.on("leave_group", (groupId) => {
    if (!groupId) return;
    socket.leave(`group:${groupId}`);
    console.log(`📤 ${socket.id} left group:${groupId}`);
  });

   // ── Typing indicators for groups ──
  socket.on("typing", ({ groupId, userId, pseudonym }) => {
    if (!groupId || !userId || !pseudonym) return;
    socket.to(`group:${groupId}`).emit("user_typing", {
      groupId,
      userId,
      pseudonym,
    });
  });

  socket.on("stop_typing", ({ groupId, userId, pseudonym }) => {
    if (!groupId || !userId) return;
    socket.to(`group:${groupId}`).emit("user_stop_typing", {
      groupId,
      userId,
      pseudonym,
    });
  });

  socket.on("identify", (userId) => {
    if (!userId) return;
    socket.join(`user:${userId}`);
    console.log(`👤 User ${userId} identified`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id} — ${reason}`);
  });
});

// Make io accessible outside this file
module.exports.io = io;

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  skipSuccessfulRequests: true,
});

const groupLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { message: "Slow down. You're posting too fast." },
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/posts", require("./routes/postRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/checkin", require("./routes/checkInRoutes"));
app.use("/api/groups", groupLimiter, require("./routes/groupRoutes"));
app.use("/api/appeals", require("./routes/appealRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/email", emailRoutes);

// Error handler - you had this, don't delete it
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: "Server error", 
    error: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Export for testing/other files
module.exports = { app, httpServer, io };
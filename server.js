const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const dotenv  = require("dotenv");
const helmet  = require("helmet");
const cors    = require("cors");
const rateLimit = require("express-rate-limit");
const { runCleanup } = require("./utils/cleanupJob");
const connectDB = require("./config/db");
const jwt     = require("jsonwebtoken");
const path    = require("path");
const morgan  = require("morgan");

const User = require("./models/User");
require("./models/GroupAuditLog");
require("./models/GroupReport");
require("./models/LoginActivity");

const emailRoutes = require("./routes/emailRoutes");

dotenv.config();
connectDB();
runCleanup();
setInterval(runCleanup, 24 * 60 * 60 * 1000);

const app        = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout:  60000,
  pingInterval: 25000,
});

// ─────────────────────────────────────────────────────────────────────────────
// WELL-KNOWN — MUST be first, before helmet/cors/json middleware
// Serves apple-app-site-association + assetlinks.json for passkey domain verification
// ─────────────────────────────────────────────────────────────────────────────
app.use("/", require("./routes/wellKnownRoutes"));

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => { req.io = io; next(); });
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────────────────────────────────────
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token"));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error("Auth error"));
  }
});

io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id} user:${socket.userId}`);

  socket.on("join_post",    (postId)   => postId   && socket.join(`post:${postId}`));
  socket.on("leave_post",   (postId)   => postId   && socket.leave(`post:${postId}`));
  socket.on("join_group",   (groupId)  => groupId  && socket.join(`group:${groupId}`));
  socket.on("leave_group",  (groupId)  => groupId  && socket.leave(`group:${groupId}`));
  socket.on("join_repost",  (repostId) => repostId && socket.join(`repost:${repostId}`));
  socket.on("leave_repost", (repostId) => repostId && socket.leave(`repost:${repostId}`));
  socket.on("identify",     (userId)   => userId   && socket.join(`user:${userId}`));

  socket.on("typing", ({ groupId, userId, pseudonym }) => {
    if (!groupId || !userId || !pseudonym) return;
    socket.to(`group:${groupId}`).emit("user_typing", { groupId, userId, pseudonym });
  });

  socket.on("stop_typing", ({ groupId, userId }) => {
    if (!groupId || !userId) return;
    socket.to(`group:${groupId}`).emit("user_stop_typing", { groupId, userId });
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

module.exports.io = io;

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITERS
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.use("/api/auth/login",    loginLimiter);
app.use("/api/auth",          require("./routes/authRoutes"));
app.use("/api/posts",         require("./routes/postRoutes"));
app.use("/api/reposts",       require("./routes/postRoutes").repostRouter);
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/admin",         require("./routes/adminRoutes"));
app.use("/api/checkin",       require("./routes/checkInRoutes"));
app.use("/api/groups",        groupLimiter, require("./routes/groupRoutes"));
app.use("/api/appeals",       require("./routes/appealRoutes"));
app.use("/api/settings",      require("./routes/settingsRoutes"));
app.use("/api/passkey",       require("./routes/passkeyRoutes"));   // ← passkeys
app.use("/api/two-step",      require("./routes/twoStepRoutes"));   // ← two-step PIN
app.use("/api/activity", require("./routes/loginActivityRoutes"));
app.use("/api/email",         emailRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// WEB FALLBACK (shared post links)
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));
app.get("/post/:postId*", (req, res) => res.sendFile(path.join(__dirname, "public", "post", "index.html")));
app.get("/post",          (req, res) => res.sendFile(path.join(__dirname, "public", "post", "index.html")));

// ─────────────────────────────────────────────────────────────────────────────
// ERROR HANDLERS
// ─────────────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Server error",
    error:   process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = { app, httpServer, io };
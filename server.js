import 'dotenv/config';  // load .env first
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import xss from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";
import connectDB from "./src/config/db.js";

import authRoutes from "./src/routes/auth.js";
import postsRoutes from "./src/routes/post.js"; // ensure this exists

const app = express();

// --- TRUST PROXY (needed for ngrok / X-Forwarded-For headers) ---
app.set("trust proxy", 1); // '1' trusts the first proxy (ngrok)

// Security middleware
app.use(helmet());
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(xss());
app.use(mongoSanitize());

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(500).json({ message: 'Server error' });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

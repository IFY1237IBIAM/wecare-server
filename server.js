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

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(xss());
app.use(mongoSanitize());

const limiter = rateLimit({ windowMs: 15*60*1000, max:200 });
app.use(limiter);

connectDB();

// Serve uploaded files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));


app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(500).json({ message: 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

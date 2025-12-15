import express from "express";
import Joi from "joi";
import multer from "multer";
import path from "path";
import fs from "fs";
import Post from "../models/Post.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

/* ---------- UPLOAD SETUP ---------- */
const UPLOADS_FOLDER = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_FOLDER)) {
  fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_FOLDER),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.random().toString(36).slice(2) + ext);
  },
});

const upload = multer({ storage });

/* ---------- CREATE POST ---------- */
router.post("/", authMiddleware, upload.array("file", 5), async (req, res) => {
  try {
    const post = new Post({
      user: req.user.id,
      pseudonym: req.body.anonymous === "true" ? "Anonymous" : req.user.pseudonym,
      content: req.body.content || "",
      anonymous: req.body.anonymous === "true",
      media: [],
      reactions: {},
      userReactions: {},
      comments: [],
      readBy: [],
    });

    if (req.files) {
      req.files.forEach((file) => {
        post.media.push({
          url: `${process.env.SERVER_URL}/uploads/${file.filename}`,
          type: file.mimetype.startsWith("video") ? "video" : "image",
        });
      });
    }

    await post.save();
    res.status(201).json(post);
  } catch (err) {
    console.error("CREATE POST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---------- GET POSTS ---------- */
router.get("/", async (_, res) => {
  const posts = await Post.find().sort({ createdAt: -1 });
  res.json(posts);
});

/* ---------- REACT / UNREACT / SWITCH ---------- */
/* ---------- REACT (REAL-TIME SAFE) ---------- */
router.post("/:id/react", authMiddleware, async (req, res) => {
  const { reaction } = req.body;
  const userId = req.user.id;

  const post = await Post.findById(req.params.id);
  if (!post) return res.sendStatus(404);

  // Remove previous reaction from user
  for (const [key, users] of post.reactions.entries()) {
    post.reactions.set(
      key,
      users.filter((u) => u.userId.toString() !== userId)
    );
  }

  // If reaction is not null → add new
  if (reaction) {
    const users = post.reactions.get(reaction) || [];
    users.push({ userId, reaction });
    post.reactions.set(reaction, users);
  }

  await post.save();

  // 🔥 EMIT REAL-TIME UPDATE
  const io = req.app.get("io");
  io.emit("reaction:update", {
    postId: post._id,
    reactions: post.reactions,
  });

  res.json({
    postId: post._id,
    reactions: post.reactions,
    userReaction: reaction,
  });
});


/* ---------- COMMENT ---------- */
router.post("/:id/comment", authMiddleware, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.sendStatus(404);

  post.comments.push({
    text: req.body.text,
    userName: req.user.pseudonym,
    createdAt: new Date(),
  });

  await post.save();
  res.json(post.comments);
});

export default router;

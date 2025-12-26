import express from "express";
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
router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user.id;

  const posts = await Post.find().sort({ createdAt: -1 });

  const enriched = posts.map((post) => {
    const obj = post.toObject();

    obj.reactions = {};
    for (const [key, users] of post.reactions.entries()) {
      obj.reactions[key] = Array.isArray(users) ? users : [];
    }

    obj.__currentUserId = userId;
    obj.__myReaction = post.userReactions?.get(userId) || null;

    return obj;
  });

  res.json(enriched);
});

/* ---------- REACT / UNREACT / SWITCH ---------- */
router.post("/:id/react", authMiddleware, async (req, res) => {
  try {
    const { reaction } = req.body;
    const userId = req.user.id;

    const post = await Post.findById(req.params.id);
    if (!post) return res.sendStatus(404);

    for (const [key, value] of post.reactions.entries()) {
      if (!Array.isArray(value)) {
        post.reactions.set(key, []);
      }
    }

    const prevReaction = post.userReactions.get(userId);

    if (prevReaction) {
      const users = post.reactions.get(prevReaction) || [];
      const filtered = users.filter(
        (u) => u.userId.toString() !== userId
      );

      if (filtered.length > 0) {
        post.reactions.set(prevReaction, filtered);
      } else {
        post.reactions.delete(prevReaction);
      }

      post.userReactions.delete(userId);
    }

    if (reaction) {
      const users = post.reactions.get(reaction) || [];

      users.push({
        userId,
        reaction,
        pseudonym: req.user.pseudonym || "Anonymous",
      });

      post.reactions.set(reaction, users);
      post.userReactions.set(userId, reaction);
    }

    await post.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("reaction:update", {
        postId: post._id,
        reactions: Object.fromEntries(post.reactions),
      });
    }

    res.json({
      postId: post._id,
      reactions: Object.fromEntries(post.reactions),
      userReaction: reaction || null,
    });
  } catch (err) {
    console.error("REACTION ERROR:", err);
    res.status(500).json({ message: "Reaction failed" });
  }
});

/* ---------- ADD COMMENT (POST OR REPLY) — STEP 3 ---------- */
router.post("/:id/comment", authMiddleware, async (req, res) => {
  try {
    const { text, parentId = null } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({ message: "Comment required" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.sendStatus(404);

    const comment = {
      userId: req.user.id,
      pseudonym: req.user.pseudonym || "Anonymous",
      text,
      parentId,
      reactions: {},
      createdAt: new Date(),
    };

    post.comments.push(comment);
    await post.save();

    res.status(201).json(comment);
  } catch (err) {
    console.error("COMMENT ERROR:", err);
    res.status(500).json({ message: "Comment failed" });
  }
});

export default router;

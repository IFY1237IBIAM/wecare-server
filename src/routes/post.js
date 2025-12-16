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
      reactions: {},       // counts will be calculated dynamically
      userReactions: {},   // Map<userId, reaction>
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

/* ---------- GET POSTS (updated to include userReaction + counts) ---------- */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    const userId = req.user.id;

    const data = posts.map((post) => {
      const reactionsObj = {};
      // Convert Map of arrays to counts
      for (const [key, users] of post.reactions.entries()) {
        reactionsObj[key] = Array.isArray(users) ? users.length : 0;
      }

      return {
        ...post.toObject(),
        reactions: reactionsObj,
        userReaction: post.userReactions.get(userId) || null,
      };
    });

    res.json(data);
  } catch (err) {
    console.error("FETCH POSTS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch posts" });
  }
});

/* ---------- REACT / UNREACT / SWITCH ---------- */
router.post("/:id/react", authMiddleware, async (req, res) => {
  try {
    const { reaction } = req.body; // string | null
    const userId = req.user.id;

    const post = await Post.findById(req.params.id);
    if (!post) return res.sendStatus(404);

    const prevReaction = post.userReactions.get(userId);

    // Remove previous reaction
    if (prevReaction) {
      const users = post.reactions.get(prevReaction) || [];
      post.reactions.set(
        prevReaction,
        users.filter((u) => u.userId !== userId)
      );
      post.userReactions.delete(userId);
    }

    // Add new reaction
    if (reaction) {
      const users = post.reactions.get(reaction) || [];
      users.push({
        userId,
        reaction,
        pseudonym: req.user.pseudonym || "Anon",
      });
      post.reactions.set(reaction, users);
      post.userReactions.set(userId, reaction);
    }

    await post.save();

    // Convert reactions Map to counts for frontend
    const reactionsObj = {};
    for (const [key, users] of post.reactions.entries()) {
      reactionsObj[key] = Array.isArray(users) ? users.length : 0;
    }

    // 🔥 SOCKET EVENT
    const io = req.app.get("io");
    if (io) {
      io.emit("reaction:update", {
        postId: post._id,
        reactions: reactionsObj,
      });
    }

    res.json({
      postId: post._id,
      reactions: reactionsObj,
      userReaction: post.userReactions.get(userId) || null,
    });
  } catch (err) {
    console.error("REACTION ERROR:", err);
    res.status(500).json({ message: "Reaction failed" });
  }
});

/* ---------- COMMENT ---------- */
router.post("/:id/comment", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.sendStatus(404);

    post.comments.push({
      text: req.body.text,
      userName: req.user.pseudonym,
      createdAt: new Date(),
    });

    await post.save();
    res.json(post.comments);
  } catch (err) {
    console.error("COMMENT ERROR:", err);
    res.status(500).json({ message: "Comment failed" });
  }
});

export default router;

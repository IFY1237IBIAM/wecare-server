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
  const parsedBody = {
    ...req.body,
    anonymous: req.body.anonymous === "true" || req.body.anonymous === true,
  };

  const schema = Joi.object({
    content: Joi.string().max(500).allow(""),
    anonymous: Joi.boolean(),
  });

  const { error, value } = schema.validate(parsedBody);
  if (error) return res.status(400).json({ message: error.message });

  try {
    const post = new Post({
      user: req.user.id,
      pseudonym: value.anonymous ? "Anonymous" : req.user.pseudonym,
      content: value.content,
      anonymous: value.anonymous,
      media: [],
      reactions: {},
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

/* ---------- MARK AS READ ---------- */
router.post("/:id/read", authMiddleware, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.sendStatus(404);

  if (!post.readBy.includes(req.user.pseudonym)) {
    post.readBy.push(req.user.pseudonym);
    await post.save();
  }

  res.json({ readBy: post.readBy });
});

/* ---------- REACT ---------- */
router.post("/:id/react", authMiddleware, async (req, res) => {
  const { reaction } = req.body;
  const post = await Post.findById(req.params.id);
  if (!post) return res.sendStatus(404);

  post.reactions.set(
    reaction,
    (post.reactions.get(reaction) || 0) + 1
  );

  await post.save();
  res.json(post.reactions);
});

/* ---------- COMMENT ---------- */
router.post("/:id/comment", authMiddleware, async (req, res) => {
  const { text } = req.body;
  const post = await Post.findById(req.params.id);
  if (!post) return res.sendStatus(404);

  post.comments.push({
    text,
    userName: req.user.pseudonym,
    createdAt: new Date(),
  });

  await post.save();
  res.json(post.comments);
});

export default router;

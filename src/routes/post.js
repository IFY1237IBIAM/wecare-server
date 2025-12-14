import express from "express";
import Joi from "joi";
import multer from "multer";
import path from "path";
import Post from "../models/Post.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.random() + ext);
  },
});

const upload = multer({ storage });

// CREATE POST (MULTIPLE MEDIA)
router.post("/", authMiddleware, upload.array("file", 5), async (req, res) => {
  const schema = Joi.object({
    content: Joi.string().max(500).allow(""),
    type: Joi.string(),
    mood: Joi.string(),
    anonymous: Joi.boolean(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const post = new Post({
      user: req.user.id,
      pseudonym: req.user.pseudonym || "Anonymous",
      content: value.content,
      type: value.type,
      mood: value.mood,
      anonymous: value.anonymous,
      media: [],
    });

    if (req.files && req.files.length > 0) {
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

router.get("/", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;

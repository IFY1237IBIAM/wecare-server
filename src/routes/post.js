import express from "express";
import Joi from "joi";
import multer from "multer";
import path from "path";
import fs from "fs";
import Post from "../models/Post.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Ensure uploads folder exists
const UPLOADS_FOLDER = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_FOLDER)) {
  fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_FOLDER),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.random().toString(36).substring(2, 8) + ext);
  },
});

const upload = multer({ storage });

// CREATE POST ROUTE
router.post("/", authMiddleware, upload.array("file", 5), async (req, res) => {
  // Convert string booleans to actual booleans
  const parsedBody = {
    ...req.body,
    anonymous: req.body.anonymous === "true" || req.body.anonymous === true,
  };

  // Validate post data
  const schema = Joi.object({
    content: Joi.string().max(500).allow(""),
    type: Joi.string().allow(""),
    mood: Joi.string().allow(""),
    anonymous: Joi.boolean(),
  });

  const { error, value } = schema.validate(parsedBody);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const post = new Post({
      user: req.user.id,
      pseudonym: req.user.pseudonym || "Anonymous",
      content: value.content,
      type: value.type || "",
      mood: value.mood || "",
      anonymous: value.anonymous,
      media: [],
    });

    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        post.media.push({
          url: `${process.env.SERVER_URL}/uploads/${file.filename}`,
          type: file.mimetype.includes("video") ? "video" : "image",
        });
      });
    }

    await post.save();
    return res.status(201).json(post);
  } catch (err) {
    console.error("CREATE POST ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET ALL POSTS
router.get("/", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error("FETCH POSTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;

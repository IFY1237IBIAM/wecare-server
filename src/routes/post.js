import express from "express";
import Joi from "joi";
import Post from "../models/Post.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// CREATE POST
router.post("/", authMiddleware, async (req, res) => {
  const schema = Joi.object({
    content: Joi.string().max(500).required(),
  });

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ message: error.details[0].message });

  try {
    const post = new Post({
      user: req.user.id,
      content: req.body.content,
    });

    await post.save();
    res.json(post);
  } catch (err) {
    console.error("CREATE POST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET ALL POSTS ✅ FIXED
router.get("/", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("user", "displayName pseudonym email")
      .sort({ createdAt: -1 });

    res.json(posts);
  } catch (err) {
    console.error("FETCH POSTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET MY POSTS
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const posts = await Post.find({ user: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(posts);
  } catch (err) {
    console.error("FETCH MY POSTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// LIKE / UNLIKE
router.post("/:id/like", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post)
      return res.status(404).json({ message: "Post not found" });

    const index = post.likes.indexOf(req.user.id);
    if (index === -1) post.likes.push(req.user.id);
    else post.likes.splice(index, 1);

    await post.save();
    res.json(post);
  } catch (err) {
    console.error("LIKE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// COMMENT
router.post("/:id/comment", authMiddleware, async (req, res) => {
  const schema = Joi.object({
    text: Joi.string().max(300).required(),
  });

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ message: error.details[0].message });

  try {
    const post = await Post.findById(req.params.id);
    if (!post)
      return res.status(404).json({ message: "Post not found" });

    post.comments.push({
      user: req.user.id,
      text: req.body.text,
    });

    await post.save();
    res.json(post);
  } catch (err) {
    console.error("COMMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE POST
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post)
      return res.status(404).json({ message: "Post not found" });

    if (post.user.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });

    await post.deleteOne();
    res.json({ message: "Post deleted" });
  } catch (err) {
    console.error("DELETE POST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;

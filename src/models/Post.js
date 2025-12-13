const express = require('express');
const Joi = require('joi');
const Post = require('../models/Post');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  const schema = Joi.object({
    content: Joi.string().max(500).required(),
  });

  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const post = new Post({
      user: req.user.id,
      content: req.body.content,
    });

    await post.save();
    res.status(201).json(post);
  } catch (err) {
    console.error("CREATE POST ERROR:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'displayName email')
      .sort({ createdAt: -1 });

    res.json(posts || []);
  } catch (err) {
    console.error("FETCH POSTS ERROR:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

import express from 'express';
import Joi from 'joi';
import multer from 'multer';
import path from 'path';
import Post from '../models/Post.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Multer setup for media upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage });

// CREATE POST
router.post('/', authMiddleware, upload.single('media'), async (req, res) => {
  const schema = Joi.object({
    content: Joi.string().max(500).allow(''),
    type: Joi.string(),
    mood: Joi.string(),
    anonymous: Joi.boolean(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const post = new Post({
      user: req.user.id,
      pseudonym: req.user.pseudonym,
      content: value.content,
      type: value.type,
      mood: value.mood,
      anonymous: value.anonymous,
    });

    if (req.file) {
      post.image = `${process.env.SERVER_URL}/uploads/${req.file.filename}`;
      post.mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    }

    await post.save();

    // Return the full post with empty reactions/comments/readBy initialized
    res.status(201).json(await Post.findById(post._id));
  } catch (err) {
    console.error('CREATE POST ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET ALL POSTS
router.get('/', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('user', 'displayName pseudonym email')
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error('FETCH POSTS ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// REACTIONS
router.post('/:id/react', authMiddleware, async (req, res) => {
  const { reaction } = req.body;
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    post.userReactions.set(reaction, !post.userReactions.get(reaction));
    post.reactions.set(reaction, (post.reactions.get(reaction) || 0) + (post.userReactions.get(reaction) ? 1 : -1));

    await post.save();
    res.json(await Post.findById(post._id));
  } catch (err) {
    console.error('REACTION ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// COMMENT
router.post('/:id/comment', authMiddleware, async (req, res) => {
  const schema = Joi.object({ text: Joi.string().max(300).required() });
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    post.comments.push({
      user: req.user.id,
      userName: req.user.pseudonym,
      text: req.body.text,
    });

    await post.save();
    res.json(await Post.findById(post._id));
  } catch (err) {
    console.error('COMMENT ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// MARK AS READ
router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const pseudonym = req.user.pseudonym;
    if (!post.readBy.includes(pseudonym)) {
      post.readBy.push(pseudonym);
      if (post.readBy.length > 4) post.readBy = post.readBy.slice(-4); // last 4 readers
    }

    await post.save();
    res.json(await Post.findById(post._id));
  } catch (err) {
    console.error('READ ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

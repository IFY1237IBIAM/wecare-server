const Post = require("../models/Post");

// @route  POST /api/posts
exports.createPost = async (req, res) => {
  try {
    const { content, mood } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const post = await Post.create({
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      content,
      mood: mood || "sadness",
    });

    return res.status(201).json({ message: "Post created 💜", post });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route  GET /api/posts
exports.getFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const lastId = req.query.lastId;

    const query = lastId ? { _id: { $lt: lastId } } : {};

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-author");

    return res.json({ posts, count: posts.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route  POST /api/posts/:id/like
exports.toggleLike = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const alreadyLiked = post.likes.includes(req.user._id);

    if (alreadyLiked) {
      post.likes.pull(req.user._id);
    } else {
      post.likes.push(req.user._id);
    }

    await post.save();

    return res.json({
      message: alreadyLiked ? "Unliked" : "💜 Here for you",
      likesCount: post.likes.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route  POST /api/posts/:id/comments
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.comments.length >= 50) {
      return res.status(400).json({ message: "Comment limit reached" });
    }

    post.comments.push({
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      text,
    });

    await post.save();

    return res.status(201).json({
      message: "Comment added 💜",
      comment: post.comments[post.comments.length - 1],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route  DELETE /api/posts/:id
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed to delete this post" });
    }

    await post.deleteOne();

    return res.json({ message: "Post deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
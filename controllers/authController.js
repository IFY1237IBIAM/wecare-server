const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// @route   POST /api/auth/signup
exports.signup = async (req, res) => {
  try {
    const { pseudonym, email, password } = req.body;

    if (!pseudonym || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { pseudonym }],
    });

    if (existingUser) {
      return res.status(400).json({
        message:
          existingUser.email === email
            ? "Email already registered"
            : "Pseudonym already taken",
      });
    }

    const user = await User.create({ pseudonym, email, password });
    const token = generateToken(user._id);

    return res.status(201).json({
      message: "Account created successfully! Welcome to WeCare 💜",
      token,
      user: {
        id: user._id,
        pseudonym: user.pseudonym,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(user._id);

    return res.json({
      message: "Welcome back 💜",
      token,
      user: {
        id: user._id,
        pseudonym: user.pseudonym,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/auth/stats
exports.getUserStats = async (req, res) => {
  try {
    const Post = require("../models/Post");

    const myPosts = await Post.find({ author: req.user._id });

    const totalPosts = myPosts.length;
    const totalReactions = myPosts.reduce((sum, post) => {
      return sum + (Array.isArray(post.reactions) ? post.reactions.length : 0);
    }, 0);
    const totalComments = myPosts.reduce((sum, post) => {
      return sum + (post.comments?.length || 0);
    }, 0);

    return res.json({ totalPosts, totalReactions, totalComments });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/auth/my-posts
exports.getMyPosts = async (req, res) => {
  try {
    const Post = require("../models/Post");

    const posts = await Post.find({ author: req.user._id })
      .sort({ createdAt: -1 })
      .select("-author");

    const postsWithReactions = posts.map((post) => {
      const obj = post.toObject();
      const reactions = Array.isArray(obj.reactions) ? obj.reactions : [];
      const reactionCounts = {};
      reactions.forEach((r) => {
        if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
      });
      return { ...obj, reactions, reactionCounts, totalReactions: reactions.length };
    });

    return res.json({ posts: postsWithReactions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/auth/saved-posts
exports.getSavedPosts = async (req, res) => {
  try {
    const User = require("../models/User");
    const Post = require("../models/Post");

    const user = await User.findById(req.user._id).select("savedPosts");
    if (!user) return res.status(404).json({ message: "User not found" });

    const posts = await Post.find({
      _id: { $in: user.savedPosts },
    })
      .sort({ createdAt: -1 })
      .select("-author");

    const postsWithReactions = posts.map((post) => {
      const obj = post.toObject();
      const reactions = Array.isArray(obj.reactions) ? obj.reactions : [];
      const reactionCounts = {};
      reactions.forEach((r) => {
        if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
      });
      return { ...obj, reactions, reactionCounts, totalReactions: reactions.length };
    });

    return res.json({ posts: postsWithReactions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
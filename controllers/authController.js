const jwt = require("jsonwebtoken");

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

exports.signup = async (req, res) => {
  try {
    const User = require("../models/User");
    const { pseudonym, email, password } = req.body;

    if (!pseudonym || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { pseudonym }] });
    if (existingUser) {
      return res.status(400).json({
        message: existingUser.email === email
          ? "Email already registered"
          : "Pseudonym already taken",
      });
    }

    // Auto-promote admin email from env
    const isAdmin = process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();

    const user = await User.create({
      pseudonym,
      email,
      password,
      role: isAdmin ? "admin" : "user",
    });

    const token = generateToken(user._id, user.role);

    return res.status(201).json({
      message: "Account created successfully! Welcome to WeCare 💜",
      token,
      user: {
        id: user._id,
        pseudonym: user.pseudonym,
        avatar: user.avatar,
        role: user.role,
        isBanned: user.isBanned,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const User = require("../models/User");
    const { email, password } = req.body;

    if (!email ||!password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid email or password" });

    const token = generateToken(user._id, user.role);

    // Return user data even if banned so frontend can show BanScreen
    return res.json({
      message: user.isBanned? "Account suspended" : "Welcome back 💜",
      token,
      user: {
        id: user._id,
        pseudonym: user.pseudonym,
        avatar: user.avatar,
        role: user.role,
        isBanned: user.isBanned,
        violations: user.violations || [],
        appealStatus: user.appealStatus || "none",
        confirmedViolations: user.confirmedViolations || 0
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const User = require("../models/User");
    const user = await User.findById(req.user.id)
      .select("+showOnlineStatus +isOnline +lastSeen +role");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

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

exports.getSavedPosts = async (req, res) => {
  try {
    const User = require("../models/User");
    const Post = require("../models/Post");
    const user = await User.findById(req.user._id).select("savedPosts");
    if (!user) return res.status(404).json({ message: "User not found" });
    const posts = await Post.find({ _id: { $in: user.savedPosts } })
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

exports.updatePresence = async (req, res) => {
  try {
    const User = require("../models/User");
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: true,
      lastSeen: new Date(),
    });
    return res.json({ message: "Presence updated" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.setOffline = async (req, res) => {
  try {
    const User = require("../models/User");
    await User.findByIdAndUpdate(req.user._id, {
      isOnline: false,
      lastSeen: new Date(),
    });
    return res.json({ message: "Set offline" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.toggleOnlineStatusPrivacy = async (req, res) => {
  try {
    const User = require("../models/User");
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.showOnlineStatus = !user.showOnlineStatus;
    await user.save({ validateBeforeSave: false });
    return res.json({
      message: user.showOnlineStatus
        ? "Online status is now visible 💜"
        : "Online status is now hidden",
      showOnlineStatus: user.showOnlineStatus,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getUserByPseudonym = async (req, res) => {
  try {
    const User = require("../models/User");
    const Post = require("../models/Post");
    const user = await User.findOne({ pseudonym: req.params.pseudonym })
      .select("pseudonym avatar isOnline lastSeen createdAt showOnlineStatus");
    if (!user) return res.status(404).json({ message: "User not found" });
    const posts = await Post.find({ author: user._id });
    const totalPosts = posts.length;
    const totalReactions = posts.reduce((sum, p) => {
      return sum + (Array.isArray(p.reactions) ? p.reactions.length : 0);
    }, 0);
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    const actuallyOnline = user.isOnline && user.lastSeen > threeMinutesAgo;
    const isOnline = user.showOnlineStatus ? actuallyOnline : null;
    const lastSeen = user.showOnlineStatus ? user.lastSeen : null;
    return res.json({
      user: {
        pseudonym: user.pseudonym,
        avatar: user.avatar,
        isOnline,
        lastSeen,
        showOnlineStatus: user.showOnlineStatus,
        joinedAt: user.createdAt,
        totalPosts,
        totalReactions,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
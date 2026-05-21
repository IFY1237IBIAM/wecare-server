const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  validateEmailDeliverable,
  generateSixDigitCode,
  generateSecureToken,
  sendWelcomeEmail,
} = require("../utils/email");

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// ─── Signup with email verification ──────────────────────────────────────────
exports.signup = async (req, res) => {
  try {
    const { pseudonym, email, password } = req.body;

    // 1. Basic presence checks
    if (!pseudonym || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // 2. Validate email format + MX records
    const emailCheck = await validateEmailDeliverable(email);
    if (!emailCheck.valid) {
      return res.status(400).json({ message: emailCheck.message });
    }

    // 3. Duplicate checks
    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const existingPseudonym = await User.findOne({ pseudonym: pseudonym.trim() });
    if (existingPseudonym) {
      return res.status(409).json({ message: "That pseudonym is already taken. Try another." });
    }

    // 4. Generate verification token + code
const verifyToken = generateSecureToken();
const verifyCode = generateSixDigitCode();
const verifyExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

// Add app deep link (used for mobile onboarding flow)
const verifyLink = `hushcircle://verify-email?token=${verifyToken}`;

// 5. Auto-promote admin email from env
const isAdmin =
  process.env.ADMIN_EMAIL &&
  email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();

// 6. Create user
const user = await User.create({
  pseudonym: pseudonym.trim(),
  email: email.toLowerCase().trim(),
  password,
  role: isAdmin ? "admin" : "user",
  emailVerificationToken: verifyToken,
  emailVerificationCode: verifyCode,
  emailVerificationExpiry: verifyExpiry,
});

// 7. Send welcome + verification email (NOW includes verifyLink)
sendWelcomeEmail({
  to: user.email,
  pseudonym: user.pseudonym,
  verifyToken,
  verifyLink, // ✅ IMPORTANT FIX
  sixDigitCode: verifyCode,
}).catch((err) =>
  console.error("Welcome email failed (non-fatal):", err)
);

// 8. Issue JWT
const token = generateToken(user._id, user.role);

    return res.status(201).json({
      message: "Account created! Check your email to verify your address.",
      user: {
        id: user._id,
        _id: user._id,
        pseudonym: user.pseudonym,
        email: user.email,
        isVerified: user.isVerified,
        avatar: user.avatar,
        role: user.role,
        isBanned: user.isBanned,
      },
      token,
    });
  } catch (err) {
    console.error("signup error:", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid email or password" });

    const token = generateToken(user._id, user.role);

    return res.json({
      message: user.isBanned ? "Account suspended" : "Welcome back 💜",
      token,
      user: {
        id: user._id,
        _id: user._id,
        pseudonym: user.pseudonym,
        avatar: user.avatar,
        role: user.role,
        isBanned: user.isBanned,
        confirmedViolations: user.confirmedViolations || 0,
        violations: user.violations || [],
        appealStatus: user.appealStatus || "none",
        showOnlineStatus: user.showOnlineStatus,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
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

exports.refreshUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("+showOnlineStatus +isOnline +lastSeen +role +appealStatus +isBanned +confirmedViolations +violations");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      user: {
        id: user._id,
        _id: user._id,
        pseudonym: user.pseudonym,
        avatar: user.avatar,
        role: user.role,
        isBanned: user.isBanned,
        confirmedViolations: user.confirmedViolations || 0,
        violations: user.violations || [],
        appealStatus: user.appealStatus || "none",
        showOnlineStatus: user.showOnlineStatus,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.clearReinstatedStatus = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { appealStatus: "none" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
}

exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const users = await User.find({
      pseudonym: { $regex: q.trim(), $options: "i" },
      isBanned: { $ne: true },
    })
      .select("pseudonym avatar isOnline lastSeen showOnlineStatus createdAt")
      .limit(20);

    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateBio = async (req, res) => {
  try {
    const { bio } = req.body;
    if (bio && bio.length > 100) {
      return res.status(400).json({ message: "Bio cannot exceed 100 characters" });
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { bio: bio?.trim() || "" },
      { new: true }
    ).select("bio pseudonym");

    return res.json({ message: "Bio updated 💜", user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
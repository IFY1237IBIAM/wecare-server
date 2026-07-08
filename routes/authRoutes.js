const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { validateEmail } = require("../middleware/validators");
const rateLimit = require("express-rate-limit");
const { getClientIp } = require("../middleware/rateLimiters");

// 5 signups per hour per IP — generous for real users, stops bot account creation
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: "Too many accounts created from this device. Please try again later." },
  skipSuccessfulRequests: false,
  keyGenerator: getClientIp,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/signup",       signupLimiter, validateEmail, authController.signup);
router.post("/login",        validateEmail, authController.login);
router.post("/switch-token", authController.login);
router.get ("/me",           protect, authController.getMe);
router.get ("/refresh",      protect, authController.refreshUser);
router.get ("/stats",        protect, authController.getUserStats);
router.get ("/my-posts",     protect, authController.getMyPosts);
router.get ("/saved-posts",  protect, authController.getSavedPosts);
router.put ("/presence",     protect, authController.updatePresence);
router.put ("/offline",      protect, authController.setOffline);
router.put ("/online-status-privacy", protect, authController.toggleOnlineStatusPrivacy);
router.put ("/bio",          protect, authController.updateBio);
// PUT /api/auth/update-pseudonym
router.put("/update-pseudonym", protect, async (req, res) => {
  try {
    const { pseudonym } = req.body;

    if (!pseudonym || !pseudonym.trim()) {
      return res.status(400).json({ message: "Pseudonym is required" });
    }

    const clean = pseudonym.trim();

    // Length check
    if (clean.length < 3 || clean.length > 20) {
      return res.status(400).json({
        message: "Pseudonym must be between 3 and 20 characters",
      });
    }

    // Only letters, numbers, underscores — no spaces or special chars
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      return res.status(400).json({
        message: "Only letters, numbers, and underscores allowed",
      });
    }

    // Reserved words
    const reserved = ["admin", "hushcircle", "moderator", "support", "system", "bot", "Circle_Keeper", "HushCircle"];
    if (reserved.includes(clean.toLowerCase())) {
      return res.status(400).json({ message: "That name is reserved" });
    }

    // Check uniqueness (case-insensitive)
    const existing = await User.findOne({
      pseudonym: { $regex: new RegExp(`^${clean}$`, "i") },
      _id: { $ne: req.user._id },
    });

    if (existing) {
      return res.status(400).json({
        message: "That pseudonym is already taken. Try another one 💜",
      });
    }

    const oldPseudonym = req.user.pseudonym;

    // Update User
    await User.findByIdAndUpdate(req.user._id, { pseudonym: clean });

    // ── Cascade update across all collections ─────────────────────────

    const Post         = require("../models/Post");
    const GroupPost    = require("../models/GroupPost");
    const Group        = require("../models/Group");
    const Notification = require("../models/Notification");

    // Update pseudonym on all their posts
    await Post.updateMany(
      { author: req.user._id },
      { $set: { pseudonym: clean } }
    );

    // Update pseudonym on all comments they made on any post
    await Post.updateMany(
      { "comments.author": req.user._id },
      { $set: { "comments.$[elem].pseudonym": clean } },
      { arrayFilters: [{ "elem.author": req.user._id }] }
    );

    // Update pseudonym on all replies they made
    await Post.updateMany(
      { "comments.replies.author": req.user._id },
      { $set: { "comments.$[].replies.$[reply].pseudonym": clean } },
      { arrayFilters: [{ "reply.author": req.user._id }] }
    );

    // Update pseudonym on group posts/messages
    await GroupPost.updateMany(
      { author: req.user._id },
      { $set: { pseudonym: clean } }
    );

    // Update creatorPseudonym on any groups they created
    await Group.updateMany(
      { creator: req.user._id },
      { $set: { creatorPseudonym: clean } }
    );

    // Update senderPseudonym on notifications they sent
    await Notification.updateMany(
      { sender: req.user._id },
      { $set: { senderPseudonym: clean } }
    );

    return res.json({
      message: "Pseudonym updated successfully 💜",
      pseudonym: clean,
      oldPseudonym,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});
router.patch("/clear-reinstated", protect, authController.clearReinstatedStatus);
router.get ("/user/:pseudonym", protect, authController.getUserByPseudonym);
router.get ("/search-users", protect, authController.searchUsers);

module.exports = router;
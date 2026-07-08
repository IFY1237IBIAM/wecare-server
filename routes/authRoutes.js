
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { validateEmail } = require("../middleware/validators");
const rateLimit = require("express-rate-limit");
const { getClientIp } = require("../middleware/rateLimiters");

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

// ── PUT /api/auth/update-pseudonym ────────────────────────────────────────
router.put("/update-pseudonym", protect, async (req, res) => {
  try {
    const User         = require("../models/User");
    const Post         = require("../models/Post");
    const GroupPost    = require("../models/GroupPost");
    const Group        = require("../models/Group");
    const Notification = require("../models/Notification");

    const { pseudonym } = req.body;

    if (!pseudonym || !pseudonym.trim()) {
      return res.status(400).json({ message: "Pseudonym is required" });
    }

    const clean = pseudonym.trim();

    if (clean.length < 3 || clean.length > 20) {
      return res.status(400).json({
        message: "Pseudonym must be between 3 and 20 characters",
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      return res.status(400).json({
        message: "Only letters, numbers, and underscores allowed",
      });
    }

    const reserved = [
      "admin", "hushcircle", "moderator", "support",
      "system", "bot", "circle_keeper",
    ];
    if (reserved.includes(clean.toLowerCase())) {
      return res.status(400).json({ message: "That name is reserved" });
    }

    // Uniqueness check (case-insensitive)
    const existing = await User.findOne({
      pseudonym: { $regex: new RegExp(`^${clean}$`, "i") },
      _id: { $ne: req.user._id },
    });

    if (existing) {
      return res.status(400).json({
        message: "That pseudonym is already taken. Try another one 💜",
      });
    }

    // Store old pseudonym BEFORE updating — used for cascade matching
    const oldPseudonym = req.user.pseudonym;

    // ── 1. Update User ────────────────────────────────────────────────
    await User.findByIdAndUpdate(req.user._id, { pseudonym: clean });

    // ── 2. Posts authored by this user ────────────────────────────────
    await Post.updateMany(
      {
        $or: [
          { author: req.user._id },
          { pseudonym: oldPseudonym },
        ],
      },
      { $set: { pseudonym: clean } }
    );

    // ── 3. Comments — match by author ID OR old pseudonym ────────────
    // The $or fallback catches comments where author field is missing
    // or stored inconsistently in older documents
    await Post.updateMany(
      {
        $or: [
          { "comments.author": req.user._id },
          { "comments.pseudonym": oldPseudonym },
        ],
      },
      { $set: { "comments.$[elem].pseudonym": clean } },
      {
        arrayFilters: [
          {
            $or: [
              { "elem.author": req.user._id },
              { "elem.pseudonym": oldPseudonym },
            ],
          },
        ],
      }
    );

    // ── 4. Replies — done in JS to avoid MongoDB path errors ──────────
    // Matches by author ID OR old pseudonym for same reason as above
    const postsWithReplies = await Post.find({
      comments: {
        $elemMatch: {
          replies: {
            $elemMatch: {
              $or: [
                { author: req.user._id },
                { pseudonym: oldPseudonym },
              ],
            },
          },
        },
      },
    }).select("comments");

    for (const post of postsWithReplies) {
      let changed = false;
      for (const comment of post.comments) {
        if (!Array.isArray(comment.replies)) continue;
        for (const reply of comment.replies) {
          const authorMatch =
            reply.author &&
            reply.author.toString() === req.user._id.toString();
          const pseudonymMatch = reply.pseudonym === oldPseudonym;
          if (authorMatch || pseudonymMatch) {
            reply.pseudonym = clean;
            changed = true;
          }
        }
      }
      if (changed) {
        await post.save({ validateBeforeSave: false });
      }
    }

    // ── 5. Group chat messages ────────────────────────────────────────
    await GroupPost.updateMany(
      {
        $or: [
          { author: req.user._id },
          { pseudonym: oldPseudonym },
        ],
      },
      { $set: { pseudonym: clean } }
    );

    // ── 6. Groups they created ────────────────────────────────────────
    await Group.updateMany(
      { creator: req.user._id },
      { $set: { creatorPseudonym: clean } }
    );

    // ── 7. Notifications they sent ────────────────────────────────────
    await Notification.updateMany(
      {
        $or: [
          { sender: req.user._id },
          { senderPseudonym: oldPseudonym },
        ],
      },
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
router.get ("/user/:pseudonym",   protect, authController.getUserByPseudonym);
router.get ("/search-users",      protect, authController.searchUsers);

module.exports = router;

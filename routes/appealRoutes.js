const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/authMiddleware");
const Appeal = require("../models/Appeal");
const User = require("../models/User");
const AdminAction = require("../models/AdminAction");
const Notification = require("../models/Notification");

// POST /api/appeals — submit appeal (user)
router.post("/", protect, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user._id;

    if (!message?.trim()) {
      return res.status(400).json({ message: "Appeal message is required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isBanned) {
      return res.status(400).json({ message: "You are not currently banned" });
    }

    // Block if already permanently banned
    if (user.appealStatus === "permanently_banned") {
      return res.status(400).json({
        message: "Your suspension is permanent. No further appeals are accepted.",
      });
    }

    const existing = await Appeal.findOne({ user: userId, status: "pending" });
    if (existing) {
      return res.status(400).json({
        message: "You have already submitted an appeal",
        appeal: existing,
      });
    }

    const violations = await AdminAction.find({
      targetUser: userId,
      action: "delete_post",
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .select("reason createdAt");

    const appeal = await Appeal.create({
      user: userId,
      pseudonym: user.pseudonym,
      message: message.trim(),
      violations: violations.map((v) => ({
        reason: v.reason,
        date: v.createdAt,
      })),
      status: "pending",
    });

    // Update user appealStatus
    await User.findByIdAndUpdate(userId, { appealStatus: "under_review" });

    return res.status(201).json({
      message: "Appeal submitted 💜",
      appeal,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// GET /api/appeals/mine
router.get("/mine", protect, async (req, res) => {
  try {
    const appeal = await Appeal.findOne({ user: req.user._id })
      .sort({ createdAt: -1 });
    return res.json({ appeal: appeal || null });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// GET /api/appeals — admin list
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const appeals = await Appeal.find().sort({ createdAt: -1 }).limit(50);
    return res.json({ appeals });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// PATCH /api/appeals/:id — accept or reject (admin)
router.patch("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { action, reviewNote } = req.body;
    if (!["accepted", "rejected"].includes(action)) {
      return res.status(400).json({ message: "Action must be accepted or rejected" });
    }

    const appeal = await Appeal.findById(req.params.id);
    if (!appeal) return res.status(404).json({ message: "Appeal not found" });
    if (appeal.status !== "pending") {
      return res.status(400).json({ message: "Appeal already reviewed" });
    }

    appeal.status = action;
    appeal.reviewedBy = req.user._id;
    appeal.reviewedByPseudonym = req.user.pseudonym;
    appeal.reviewNote = reviewNote || "";
    appeal.reviewedAt = new Date();
    if (action === "rejected") appeal.appealRejected = true;
    await appeal.save();

    const user = await User.findById(appeal.user);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (action === "accepted") {
      // ── Reinstate user ──
      user.isBanned = false;
      user.confirmedViolations = 0;
      user.appealStatus = "reinstated"; // ← key fix
      await user.save({ validateBeforeSave: false });

      await Notification.create({
        recipient: appeal.user,
        sender: req.user._id,
        senderPseudonym: "WeCare Team",
        type: "post_removed",
        adminMessage: "Your appeal has been accepted.",
        adminReason: "Appeal accepted by moderation team",
        nextStep: "Welcome back to WeCare 💜. Your ban has been lifted and your violation record has been reset. Please review our community guidelines going forward.",
        violationCount: 0,
        isBanNotification: false,
        isUnban: true,
        read: false,
      });

      await AdminAction.create({
        admin: req.user._id,
        adminPseudonym: req.user.pseudonym,
        action: "ban_user",
        targetUser: appeal.user,
        reason: "Appeal accepted — user reinstated",
      });
    } else {
      // ── Permanently ban ──
      user.isBanned = true;
      user.appealStatus = "permanently_banned"; // ← key fix
      await user.save({ validateBeforeSave: false });

      await Notification.create({
        recipient: appeal.user,
        sender: req.user._id,
        senderPseudonym: "WeCare Team",
        type: "post_removed",
        adminMessage: "Your appeal has been rejected.",
        adminReason: reviewNote || "Appeal does not meet criteria for reinstatement",
        nextStep: "After careful review, we have decided to uphold the suspension. This decision is final. Your account will remain permanently suspended.",
        violationCount: user.confirmedViolations,
        isBanNotification: true,
        isUnban: false,
        read: false,
      });

      await AdminAction.create({
        admin: req.user._id,
        adminPseudonym: req.user.pseudonym,
        action: "ban_user",
        targetUser: appeal.user,
        reason: "Appeal rejected — permanently banned",
      });
    }

    return res.json({
      message: `Appeal ${action} 💜`,
      appeal,
      userUnbanned: action === "accepted",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
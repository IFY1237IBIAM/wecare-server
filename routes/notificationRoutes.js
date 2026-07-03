console.log('✅ notificationRoutes.js loaded');
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const Notification = require("../models/Notification");
const NotificationToken = require("../models/NotificationToken");

// ── Save push token ────────────────────────────────────────────────────────
router.post("/token", protect, async (req, res) => {
  try {
    const { expoPushToken, platform } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({ message: "Token required" });
    }

    if (
      !expoPushToken.startsWith("ExponentPushToken[") &&
      !expoPushToken.startsWith("ExpoPushToken[")
    ) {
      return res.status(400).json({ message: "Invalid push token" });
    }

    await NotificationToken.findOneAndUpdate(
      { expoPushToken },
      {
        expoPushToken,
        user: req.user._id,
        platform: platform || "android",
        lastUsedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.json({ message: "Token saved 💜" });
  } catch (e) {
    if (e.code === 11000) return res.json({ message: "Token already saved" });
    return res.status(500).json({ message: e.message });
  }
});

// ── Get all notifications ──────────────────────────────────────────────────
router.get("/", protect, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("post", "_id group")
      .lean();
    return res.json({ notifications });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

router.get("/my-token", protect, async (req, res) => {
  try {
    const tokens = await NotificationToken.find({ user: req.user._id });
    return res.json({ tokens });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});
// ── Unread count ───────────────────────────────────────────────────────────
router.get("/unread-count", protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      read: false,
      type: { $ne: "post_removed" },
    });
    return res.json({ count });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── Get popup (post_removed) ───────────────────────────────────────────────
router.get("/popup", protect, async (req, res) => {
  try {
    const popup = await Notification.findOne({
      recipient: req.user._id,
      type: "post_removed",
      read: false,
    }).sort({ createdAt: -1 });
    return res.json({ popup: popup || null });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── Mark all as read ───────────────────────────────────────────────────────
// IMPORTANT: this must come before /:id routes so Express doesn't treat
// "read-all" as an :id param
router.patch("/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { read: true }
    );
    return res.json({ message: "All marked as read" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── Mark popup as read ─────────────────────────────────────────────────────
router.patch("/popup/:id/read", protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id, type: "post_removed" },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Popup not found" });
    return res.json({ message: "Popup dismissed" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── Mark one as read ───────────────────────────────────────────────────────
router.patch("/:id/read", protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    return res.json({ message: "Marked as read" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── Delete ALL ─────────────────────────────────────────────────────────────
// IMPORTANT: must come before DELETE /:id or Express matches "/" as an :id
router.delete("/", protect, async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user._id });
    return res.json({ message: "All notifications cleared" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── Delete one ─────────────────────────────────────────────────────────────
router.delete("/:id", protect, async (req, res) => {
  try {
    const result = await Notification.deleteOne({
      _id: req.params.id,
      recipient: req.user._id,
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }
    return res.json({ message: "Notification deleted" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// TEMPORARY - clean up stale tokens
router.delete("/cleanup-tokens", protect, async (req, res) => {
  try {
    await NotificationToken.deleteMany({ user: req.user._id });
    return res.json({ message: "All tokens cleared" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── mark-all-read (PUT alias kept for backwards compat) ───────────────────
router.put("/mark-all-read", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { read: true }
    );
    return res.json({ message: "All marked as read" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
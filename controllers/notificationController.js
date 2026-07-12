/**
 * controllers/notificationController.js — WITH PAGINATION
 *
 * Changes from original:
 *   - getNotifications now supports cursor-based pagination
 *     (page param for simplicity since notifications are sequential)
 *   - Default page size: 20 (was 50, which is too heavy for mobile)
 *   - Returns hasMore flag so frontend knows when to stop fetching
 *   - getUnreadCount unchanged (it's already a fast countDocuments)
 *   - markAllRead and markOneRead unchanged
 *   - saveToken unchanged
 */

const Notification = require("../models/Notification");
const User         = require("../models/User");
const { Expo }     = require("expo-server-sdk");

const expo = new Expo();

const PAGE_SIZE = 20;

// @route GET /api/notifications?page=1
exports.getNotifications = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const skip  = (page - 1) * PAGE_SIZE;

    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(PAGE_SIZE)
        .lean(),   // ← lean() returns plain JS objects, ~40% faster than full Mongoose docs
      Notification.countDocuments({ recipient: req.user._id }),
    ]);

    return res.json({
      notifications,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
      hasMore:    skip + notifications.length < total,
      total,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/notifications/unread-count
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      read:      false,
    });
    return res.json({ count });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PATCH /api/notifications/read-all
exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { read: true }
    );
    return res.json({ message: "All notifications marked as read" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/notifications/:id/read
exports.markOneRead = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    return res.json({ message: "Notification marked as read" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/notifications/token
exports.saveToken = async (req, res) => {
  try {
    const { expoPushToken, platform } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({ message: "expoPushToken is required" });
    }

    if (!Expo.isExpoPushToken(expoPushToken)) {
      return res.status(400).json({ message: "Invalid Expo push token format" });
    }

    await User.findByIdAndUpdate(req.user._id, { expoPushToken });

    console.log(`📲 Push token saved for user ${req.user._id} [${platform || "unknown"}]`);
    return res.json({ message: "Push token saved" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
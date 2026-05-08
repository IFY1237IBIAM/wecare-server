const Notification = require("../models/Notification");

// @route GET /api/notifications
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({ notifications });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/notifications/unread-count
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      read: false,
    });
    return res.json({ count });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/notifications/mark-all-read
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
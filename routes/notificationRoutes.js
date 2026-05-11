const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, notificationController.getNotifications);
router.get("/unread-count", protect, notificationController.getUnreadCount);
// @route GET /api/notifications/popup
router.get("/popup", protect, async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    const popup = await Notification.findOne({
      recipient: req.user._id,
      type: "post_removed",
      read: false,
    }).sort({ createdAt: -1 });
    return res.json({ popup: popup || null });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// @route PUT /api/notifications/popup/:id/read
router.put("/popup/:id/read", protect, async (req, res) => {
  try {
    const Notification = require("../models/Notification");
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    return res.json({ message: "Popup dismissed" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
router.put("/mark-all-read", protect, notificationController.markAllRead);
router.put("/:id/read", protect, notificationController.markOneRead);

module.exports = router;
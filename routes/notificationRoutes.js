const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, notificationController.getNotifications);
router.get("/unread-count", protect, notificationController.getUnreadCount);
router.put("/mark-all-read", protect, notificationController.markAllRead);
router.put("/:id/read", protect, notificationController.markOneRead);

module.exports = router;
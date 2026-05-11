const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

router.use(protect, adminOnly);

router.get("/reported-posts", adminController.getReportedPosts);
router.post("/delete-post", adminController.deleteReportedPost);
router.post("/dismiss-report", adminController.dismissReport);
router.get("/actions", adminController.getAdminActions);
router.get("/stats", adminController.getAdminStats);

module.exports = router;
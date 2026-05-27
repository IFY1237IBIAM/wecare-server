const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

router.use(protect, adminOnly);

router.get("/reported-posts", adminController.getReportedPosts);
router.get("/banned-users", adminController.getBannedUsers);
router.get("/user-info/:pseudonym", adminController.getUserInfo);
router.get("/actions", adminController.getAdminActions);
router.get("/stats", adminController.getAdminStats);
router.get("/appeals", adminController.getAppeals);

// ── NEW: Group reports ──────────────────────────────────────────────────────
router.get("/group-reports", adminController.getGroupReports);
router.patch("/group-reports/:reportId", adminController.reviewGroupReport);

router.post("/delete-post", adminController.deleteReportedPost);
router.post("/dismiss-report", adminController.dismissReport);
router.post("/unban-user", adminController.unbanUser);

module.exports = router;
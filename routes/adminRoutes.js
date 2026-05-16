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

// Comment these out since the functions don't exist yet
// router.get("/appeals", adminController.getAppeals); 
// router.post("/ban-user", adminController.banUser);

router.post("/delete-post", adminController.deleteReportedPost);
router.post("/dismiss-report", adminController.dismissReport);
router.post("/unban-user", adminController.unbanUser);

module.exports = router;
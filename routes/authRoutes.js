const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/me", protect, authController.getMe);
router.get("/refresh", protect, authController.refreshUser);
router.get("/stats", protect, authController.getUserStats);
router.get("/my-posts", protect, authController.getMyPosts);
router.get("/saved-posts", protect, authController.getSavedPosts);
router.put("/presence", protect, authController.updatePresence);
router.put("/offline", protect, authController.setOffline);
router.put("/online-status-privacy", protect, authController.toggleOnlineStatusPrivacy);
router.put("/bio", protect, authController.updateBio);
router.patch("/clear-reinstated", protect, authController.clearReinstatedStatus);
router.get("/user/:pseudonym", protect, authController.getUserByPseudonym);
router.get("/search-users", protect, authController.searchUsers);

module.exports = router;
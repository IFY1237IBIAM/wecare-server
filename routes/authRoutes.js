const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/me", protect, authController.getMe);
router.get("/stats", protect, authController.getUserStats);
router.get("/my-posts", protect, authController.getMyPosts);
router.get("/saved-posts", protect, authController.getSavedPosts);

module.exports = router;
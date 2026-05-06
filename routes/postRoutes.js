const express = require("express");
const router = express.Router();
const postController = require("../controllers/postController");
const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, postController.getFeed);
router.post("/", protect, postController.createPost);
router.post("/:id/like", protect, postController.toggleLike);
router.post("/:id/comments", protect, postController.addComment);
router.delete("/:id", protect, postController.deletePost);

module.exports = router;
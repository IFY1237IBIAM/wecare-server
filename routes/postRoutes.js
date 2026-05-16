const express = require("express");
const router = express.Router();
const postController = require("../controllers/postController");
const { protect } = require("../middleware/authMiddleware");

router.get("/search", protect, postController.searchPosts);
router.get("/hashtag/:tag", protect, postController.getPostsByHashtag); // ← add here
router.get("/feed", protect, postController.getFeed);
router.get("/", protect, postController.getFeed);
router.post("/", protect, postController.createPost);
router.post("/:id/react", protect, postController.reactToPost);
router.post("/:id/comments", protect, postController.addComment);
router.post("/:id/comments/:commentId/replies", protect, postController.addReply);
router.put("/:id", protect, postController.editPost);
router.delete("/:id", protect, postController.deletePost);
router.post("/:id/save", protect, postController.savePost);
router.post("/:id/report", protect, postController.reportPost);

module.exports = router;
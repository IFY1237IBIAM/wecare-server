const express = require("express");
const router = express.Router();
const postController = require("../controllers/postController");
const { protect } = require("../middleware/authMiddleware");

router.get("/search", protect, postController.searchPosts);
router.get("/hashtag/:tag", protect, postController.getPostsByHashtag); // ← add here
router.get("/feed", protect, postController.getFeed);
router.get("/", protect, postController.getFeed);
router.get("/:id", protect, async (req, res) => {
  try {
    const Post = require("../models/Post");
    const post = await Post.findById(req.params.id)
      .populate("author", "pseudonym")
      .lean();
    
    if (!post) return res.status(404).json({ message: "Post not found" });
    
    res.json({ post });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
router.post("/", protect, postController.createPost);
router.post("/:id/react", protect, postController.reactToPost);
router.post("/:id/comments", protect, postController.addComment);
router.post("/:id/comments/:commentId/replies", protect, postController.addReply);
router.put("/:id", protect, postController.editPost);
router.delete("/:id", protect, postController.deletePost);
router.post("/:id/save", protect, postController.savePost);
router.post("/:id/report", protect, postController.reportPost);
router.put("/:id/comments/:commentId", protect, postController.editComment);
router.delete("/:id/comments/:commentId", protect, postController.deleteComment);
router.put("/:id/comments/:commentId/replies/:replyId", protect, postController.editReply);
router.delete("/:id/comments/:commentId/replies/:replyId", protect, postController.deleteReply);
module.exports = router;
const express = require("express");
const router = express.Router();
const postController = require("../controllers/postController");
const { protect } = require("../middleware/authMiddleware");

router.get("/search", protect, postController.searchPosts);
router.get("/hashtag/:tag", protect, postController.getPostsByHashtag);
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

// ── Repost routes ─────────────────────────────────────────────────────────
router.post("/:id/repost", protect, postController.createRepost);
router.delete("/:id/repost", protect, postController.deleteRepost);
router.get("/:id/reposts", protect, postController.getReposts);

// ── NEW: Creator toggles repost permission on their own post ──────────────
router.patch("/:id/allow-reposts", protect, postController.toggleAllowReposts);

// ── NEW: Secondary comment stream — mounted separately at /api/reposts ────
// A dedicated router avoids the /:id wildcard above swallowing "reposts".
// In server.js:  app.use("/api/reposts", require("./routes/postRoutes").repostRouter);
const repostRouter = express.Router();
repostRouter.post("/:repostId/comments",                      protect, postController.addRepostComment);
repostRouter.put("/:repostId/comments/:commentId",             protect, postController.editRepostComment);
repostRouter.delete("/:repostId/comments/:commentId",          protect, postController.deleteRepostComment);

module.exports = router;
module.exports.repostRouter = repostRouter;
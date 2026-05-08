const express = require("express");
const router = express.Router();
const postController = require("../controllers/postController");
const { protect } = require("../middleware/authMiddleware");
const Post = require("../models/Post");

router.get("/migrate/fix-reactions", async (req, res) => {
  try {
    const posts = await Post.find({});
    let fixed = 0;
    for (const post of posts) {
      if (!Array.isArray(post.reactions)) {
        await Post.updateOne({ _id: post._id }, { $set: { reactions: [] } });
        fixed++;
      }
    }
    res.json({ message: "Done", fixed });
  } catch (error) {
    res.json({ error: error.message });
  }
});

router.get("/", protect, postController.getFeed);
router.post("/", protect, postController.createPost);
router.post("/:id/react", protect, postController.reactToPost);
router.post("/:id/comments", protect, postController.addComment);
router.put("/:id", protect, postController.editPost);
router.delete("/:id", protect, postController.deletePost);
router.post("/:id/report", protect, postController.reportPost);
router.post("/:id/save", protect, postController.savePost);

module.exports = router;
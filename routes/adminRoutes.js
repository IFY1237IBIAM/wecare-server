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


// GET /api/admin/comment-reports
router.get("/comment-reports", protect, requireAdmin, async (req, res) => {
  try {
    const CommentReport = require("../models/CommentReport");
    const reports = await CommentReport.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .populate("reporter", "pseudonym")
      .populate("post", "content pseudonym")
      .lean();
    return res.json({ reports });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// PUT /api/admin/comment-reports/:id/dismiss
router.put("/comment-reports/:id/dismiss", protect, requireAdmin, async (req, res) => {
  try {
    const CommentReport = require("../models/CommentReport");
    await CommentReport.findByIdAndUpdate(req.params.id, { status: "dismissed" });
    return res.json({ message: "Dismissed" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// PUT /api/admin/comment-reports/:id/resolve
router.put("/comment-reports/:id/resolve", protect, requireAdmin, async (req, res) => {
  try {
    const CommentReport = require("../models/CommentReport");
    const Post = require("../models/Post");

    const report = await CommentReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    const post = await Post.findById(report.post);
    if (post) {
      if (report.replyId) {
        // Remove the reply
        post.comments = post.comments.map((c) => {
          if (c._id.toString() === report.commentId) {
            c.replies = (c.replies || []).map((r) =>
              r._id.toString() === report.replyId
                ? { ...r.toObject?.() ?? r, text: "This reply was removed by a moderator.", deleted: true }
                : r
            );
          }
          return c;
        });
      } else {
        // Soft delete the comment
        post.comments = post.comments.map((c) =>
          c._id.toString() === report.commentId
            ? { ...c.toObject?.() ?? c, text: "This comment was removed by a moderator.", deleted: true }
            : c
        );
      }
      await post.save({ validateBeforeSave: false });
    }

    await CommentReport.findByIdAndUpdate(req.params.id, { status: "reviewed" });
    return res.json({ message: "Comment removed and report resolved" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
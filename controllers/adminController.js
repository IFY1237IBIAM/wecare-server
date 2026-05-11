const Post = require("../models/Post");
const Report = require("../models/Report");
const User = require("../models/User");
const Notification = require("../models/Notification");
const AdminAction = require("../models/AdminAction");

// @route GET /api/admin/reported-posts
exports.getReportedPosts = async (req, res) => {
  try {
    const reports = await Report.aggregate([
      { $match: { status: "pending" } },
      {
        $group: {
          _id: "$post",
          reportCount: { $sum: 1 },
          reasons: { $push: "$reason" },
          latestReport: { $max: "$createdAt" },
          postContent: { $first: "$postContent" },
          postPseudonym: { $first: "$postPseudonym" },
          reportIds: { $push: "$_id" },
        },
      },
      { $sort: { reportCount: -1 } },
    ]);

    const enriched = await Promise.all(
      reports.map(async (r) => {
        const post = await Post.findById(r._id).select("content mood pseudonym flagged flagType createdAt");
        const reasonCounts = r.reasons.reduce((acc, reason) => {
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {});
        return {
          postId: r._id,
          post,
          reportCount: r.reportCount,
          reasons: reasonCounts,
          latestReport: r.latestReport,
          postContent: r.postContent,
          postPseudonym: r.postPseudonym,
          reportIds: r.reportIds,
        };
      })
    );

    return res.json({ reports: enriched.filter((r) => r.post) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/admin/delete-post
exports.deleteReportedPost = async (req, res) => {
  try {
    const { postId, reason, notifyUser } = req.body;
    if (!postId) return res.status(400).json({ message: "Post ID required" });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const postAuthor = await User.findById(post.author);

    // Increment report count on user
    if (postAuthor) {
      postAuthor.reportCount = (postAuthor.reportCount || 0) + 1;

      // Ban user if report count hits 3
      if (postAuthor.reportCount >= 3) {
        postAuthor.isBanned = true;
      }

      await postAuthor.save({ validateBeforeSave: false });

      // Notify user
      if (notifyUser !== false) {
        const isBanned = postAuthor.isBanned;
        const systemUser = { _id: req.user._id };

        await Notification.create({
          recipient: post.author,
          sender: req.user._id,
          senderPseudonym: "WeCare Team",
          type: "post_removed",
          postPreview: post.content?.substring(0, 60),
          adminMessage: isBanned
            ? `Your post was removed and your account has been suspended for repeatedly violating our community guidelines. Reason: ${reason || "Community guideline violation"}`
            : `Your post was removed by our moderation team. Reason: ${reason || "Community guideline violation"}. This is violation ${postAuthor.reportCount} of 3. Continued violations may result in account suspension.`,
          read: false,
        });
      }
    }

    // Mark all reports as actioned
    await Report.updateMany({ post: postId }, { status: "actioned" });

    // Log admin action
    await AdminAction.create({
      admin: req.user._id,
      adminPseudonym: req.user.pseudonym,
      action: "delete_post",
      targetPost: postId,
      targetUser: post.author,
      reason: reason || "Community guideline violation",
      reportCount: postAuthor?.reportCount,
    });

    // Delete the post
    await post.deleteOne();

    return res.json({
      message: "Post deleted and user notified 💜",
      userBanned: postAuthor?.isBanned || false,
      userReportCount: postAuthor?.reportCount || 0,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/admin/dismiss-report
exports.dismissReport = async (req, res) => {
  try {
    const { postId, reason } = req.body;
    if (!postId) return res.status(400).json({ message: "Post ID required" });

    await Report.updateMany({ post: postId }, { status: "dismissed" });

    await AdminAction.create({
      admin: req.user._id,
      adminPseudonym: req.user.pseudonym,
      action: "dismiss_report",
      targetPost: postId,
      reason: reason || "No violation found",
    });

    return res.json({ message: "Report dismissed" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/admin/actions
exports.getAdminActions = async (req, res) => {
  try {
    const actions = await AdminAction.find()
      .sort({ createdAt: -1 })
      .limit(50);
    return res.json({ actions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/admin/stats
exports.getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: "user" });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const totalPosts = await Post.countDocuments();
    const pendingReports = await Report.countDocuments({ status: "pending" });
    const totalActions = await AdminAction.countDocuments();

    return res.json({
      totalUsers,
      bannedUsers,
      totalPosts,
      pendingReports,
      totalActions,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
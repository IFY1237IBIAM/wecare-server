const Post = require("../models/Post");
const Report = require("../models/Report");
const User = require("../models/User");
const Notification = require("../models/Notification");
const AdminAction = require("../models/AdminAction");
const Appeal = require("../models/Appeal");
const GroupReport = require("../models/GroupReport");

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
        const post = await Post.findById(r._id)
          .select("content mood pseudonym flagged flagType createdAt");
        const reasonCounts = r.reasons.reduce((acc, reason) => {
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {});
        return {
          postId: r._id, post, reportCount: r.reportCount,
          reasons: reasonCounts, latestReport: r.latestReport,
          postContent: r.postContent, postPseudonym: r.postPseudonym,
          reportIds: r.reportIds,
        };
      })
    );

    return res.json({ reports: enriched.filter((r) => r.post) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteReportedPost = async (req, res) => {
  try {
    const { postId, reason, notifyUser } = req.body;
    if (!postId) return res.status(400).json({ message: "Post ID required" });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const postAuthor = await User.findById(post.author);
    let userBanned = false;
    let newViolationCount = 0;

    if (postAuthor) {
      const alreadyCounted = await AdminAction.findOne({ targetPost: postId, action: "delete_post" });
      if (!alreadyCounted) postAuthor.confirmedViolations = (postAuthor.confirmedViolations || 0) + 1;
      newViolationCount = postAuthor.confirmedViolations;

      if (postAuthor.confirmedViolations >= 3 && !postAuthor.isBanned) {
        postAuthor.isBanned = true;
        userBanned = true;
        postAuthor.appealStatus = "none";
        await Appeal.deleteMany({ user: postAuthor._id });
      }
      await postAuthor.save({ validateBeforeSave: false });

      if (notifyUser !== false) {
        const violationNum = postAuthor.confirmedViolations;
        let adminMessage = "";
        let nextStep = "";

        if (userBanned) {
          adminMessage = "Your account has been suspended from HushCircle.";
          nextStep = `After 3 confirmed violations of our community guidelines, your account has been permanently suspended. You can no longer post, comment, or interact on HushCircle. If you believe this is a mistake, please submit an appeal.`;
        } else {
          adminMessage = "One of your posts has been removed by our moderation team.";
          nextStep = `This is violation ${violationNum} of 3. After 3 confirmed violations, your account will be automatically suspended. Please review our community guidelines to avoid further action.`;
        }

        await Notification.create({
          recipient: post.author,
          sender: req.user._id,
          senderPseudonym: "HushCircle Team",
          type: "post_removed",
          postPreview: post.content?.substring(0, 80),
          adminMessage,
          adminReason: reason || "Community guideline violation",
          nextStep,
          violationCount: violationNum,
          isBanNotification: userBanned,
          isUnban: false,
          read: false,
        });
      }
    }

    await Report.updateMany({ post: postId }, { status: "actioned" });
    await AdminAction.create({
      admin: req.user._id,
      adminPseudonym: req.user.pseudonym,
      action: "delete_post",
      targetPost: postId,
      targetUser: post.author,
      reason: reason || "Community guideline violation",
      reportCount: newViolationCount,
    });
    await post.deleteOne();

    return res.json({ message: "Post deleted and user notified 💜", userBanned, violationCount: newViolationCount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getBannedUsers = async (req, res) => {
  try {
    const bannedUsers = await User.find({ isBanned: true })
      .select("pseudonym email confirmedViolations createdAt lastSeen isBanned appealStatus")
      .sort({ updatedAt: -1 });

    const enriched = await Promise.all(
      bannedUsers.map(async (user) => {
        const lastAction = await AdminAction.findOne({ targetUser: user._id, action: "delete_post" })
          .sort({ createdAt: -1 })
          .select("reason createdAt adminPseudonym");
        const rejectedAppeal = await Appeal.findOne({ user: user._id, status: "rejected" });
        const pendingAppeal = await Appeal.findOne({ user: user._id, status: "pending" });
        return {
          _id: user._id,
          pseudonym: user.pseudonym,
          confirmedViolations: user.confirmedViolations || 0,
          createdAt: user.createdAt,
          lastSeen: user.lastSeen,
          appealStatus: user.appealStatus || "none",
          lastViolationReason: lastAction?.reason || "Community guideline violation",
          lastViolationDate: lastAction?.createdAt,
          bannedBy: lastAction?.adminPseudonym || "System",
          hasRejectedAppeal: !!rejectedAppeal,
          hasPendingAppeal: !!pendingAppeal,
          unbanLocked: user.appealStatus === "permanently_banned",
        };
      })
    );

    return res.json({ bannedUsers: enriched });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

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

exports.unbanUser = async (req, res) => {
  try {
    const { pseudonym, resetViolations } = req.body;
    if (!pseudonym) return res.status(400).json({ message: "Pseudonym required" });

    const user = await User.findOne({ pseudonym });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isBanned = false;
    if (resetViolations) user.confirmedViolations = 0;
    user.appealStatus = "reinstated";
    await user.save({ validateBeforeSave: false });
    await Appeal.deleteMany({ user: user._id });

    await Notification.create({
      recipient: user._id,
      sender: req.user._id,
      senderPseudonym: "HushCircle Team",
      type: "post_removed",
      adminMessage: "Your account has been reinstated.",
      adminReason: "Account reinstated by moderation team",
      nextStep: "Welcome back to HushCircle 💜. Your account has been reinstated. Please ensure you follow our community guidelines going forward. We are glad to have you back.",
      violationCount: user.confirmedViolations,
      isBanNotification: false,
      isUnban: true,
      read: false,
    });

    await AdminAction.create({
      admin: req.user._id,
      adminPseudonym: req.user.pseudonym,
      action: "ban_user",
      targetUser: user._id,
      reason: `Manually unbanned${resetViolations ? " and violations reset" : ""}`,
    });

    return res.json({
      message: `${pseudonym} has been unbanned`,
      violationsReset: resetViolations,
      currentViolations: user.confirmedViolations,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getUserInfo = async (req, res) => {
  try {
    const user = await User.findOne({ pseudonym: req.params.pseudonym })
      .select("pseudonym email role isBanned confirmedViolations createdAt lastSeen appealStatus");
    if (!user) return res.status(404).json({ message: "User not found" });

    const recentActivity = await AdminAction.find({ targetUser: user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("action reason createdAt adminPseudonym");

    const rejectedAppeal = await Appeal.findOne({ user: user._id, status: "rejected" });

    return res.json({ user, recentActivity, hasRejectedAppeal: !!rejectedAppeal });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getAdminActions = async (req, res) => {
  try {
    const actions = await AdminAction.find().sort({ createdAt: -1 }).limit(50);
    return res.json({ actions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: "user" });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const totalPosts = await Post.countDocuments();
    const pendingReports = await Report.countDocuments({ status: "pending" });
    const totalActions = await AdminAction.countDocuments();
    const pendingGroupReports = await GroupReport.countDocuments({ status: "pending" });
    return res.json({ totalUsers, bannedUsers, totalPosts, pendingReports, totalActions, pendingGroupReports });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getAppeals = async (req, res) => {
  try {
    const appeals = await Appeal.find().sort({ createdAt: -1 }).limit(50);
    return res.json({ appeals });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ── NEW: Group reports ─────────────────────────────────────────────────────
exports.getGroupReports = async (req, res) => {
  try {
    const reports = await GroupReport.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(50);
    return res.json({ reports });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.reviewGroupReport = async (req, res) => {
  try {
    const { action, reason } = req.body; // action: "actioned" | "dismissed"
    const report = await GroupReport.findById(req.params.reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    report.status = action === "actioned" ? "actioned" : "dismissed";
    await report.save();

    await AdminAction.create({
      admin: req.user._id,
      adminPseudonym: req.user.pseudonym,
      action: "group_report_reviewed",
      targetUser: report.targetUser,
      targetGroup: report.group,
      reason: reason || `Group report ${action}`,
    });

    return res.json({ message: `Report ${action}` });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
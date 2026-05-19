const UserSettings = require("../models/UserSettings");
const User = require("../models/User");
const Post = require("../models/Post");
const Report = require("../models/Report");
const Notification = require("../models/Notification");
const Appeal = require("../models/Appeal");
const AdminAction = require("../models/AdminAction");
const CheckIn = require("../models/CheckIn");
const NotificationToken = require("../models/NotificationToken");

const getOrCreateSettings = async (userId) => {
  let settings = await UserSettings.findOne({ user: userId });
  if (!settings) {
    settings = await UserSettings.create({ user: userId });
  }
  return settings;
};

// GET /api/settings
exports.getSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    const user = await User.findById(req.user._id)
      .select("pseudonym email isOnline showOnlineStatus confirmedViolations isBanned");

    return res.json({ settings, user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// PUT /api/settings
exports.updateSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    const allowed = [
      "isProfilePrivate",
      "pushNotifications",
      "emailNotifications",
      "quietHours",
      "contentSensitivity",
      "theme",
      "fontSize",
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] === "object" && !Array.isArray(req.body[key])) {
          settings[key] = { ...settings[key].toObject?.() || settings[key], ...req.body[key] };
        } else {
          settings[key] = req.body[key];
        }
      }
    }

    await settings.save();
    return res.json({ message: "Settings updated 💜", settings });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /api/settings/muted-keywords
exports.addMutedKeyword = async (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword?.trim()) return res.status(400).json({ message: "Keyword required" });

    const settings = await getOrCreateSettings(req.user._id);
    const kw = keyword.trim().toLowerCase();

    if (settings.mutedKeywords.includes(kw)) {
      return res.status(400).json({ message: "Keyword already muted" });
    }
    if (settings.mutedKeywords.length >= 50) {
      return res.status(400).json({ message: "Maximum 50 muted keywords" });
    }

    settings.mutedKeywords.push(kw);
    await settings.save();

    return res.json({ message: "Keyword muted 💜", mutedKeywords: settings.mutedKeywords });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// DELETE /api/settings/muted-keywords/:keyword
exports.removeMutedKeyword = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    settings.mutedKeywords = settings.mutedKeywords.filter(
      (k) => k !== decodeURIComponent(req.params.keyword).toLowerCase()
    );
    await settings.save();
    return res.json({ message: "Keyword removed", mutedKeywords: settings.mutedKeywords });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /api/settings/block/:userId
exports.blockUser = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    const targetId = req.params.userId;

    if (targetId === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot block yourself" });
    }
    if (settings.blockedUsers.map((u) => u.toString()).includes(targetId)) {
      return res.status(400).json({ message: "User already blocked" });
    }

    settings.blockedUsers.push(targetId);
    await settings.save();

    return res.json({ message: "User blocked 💜" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// DELETE /api/settings/block/:userId
exports.unblockUser = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user._id);
    settings.blockedUsers = settings.blockedUsers.filter(
      (u) => u.toString() !== req.params.userId
    );
    await settings.save();
    return res.json({ message: "User unblocked 💜" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// GET /api/settings/blocked-users
exports.getBlockedUsers = async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ user: req.user._id })
      .populate("blockedUsers", "pseudonym");
    if (!settings) return res.json({ blockedUsers: [] });
    return res.json({ blockedUsers: settings.blockedUsers });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both fields are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    if (!/(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(newPassword)) {
      return res.status(400).json({ message: "Need uppercase, lowercase, number & special character" });
    }

    const user = await User.findById(req.user._id).select("+password");
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // ── NEW: block same password ──
    const isSameAsOld = await user.matchPassword(newPassword);
    if (isSameAsOld) {
      return res.status(400).json({
        message: "New password cannot be the same as your current password",
      });
    }

    user.password = newPassword;
    await user.save();

    return res.json({ message: "Password updated 💜" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// PUT /api/settings/change-email
exports.changeEmail = async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    if (!newEmail || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findById(req.user._id).select("+password");
    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: "Password is incorrect" });

    const existing = await User.findOne({ email: newEmail.toLowerCase() });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    user.email = newEmail.toLowerCase();
    await user.save();

    return res.json({ message: "Email updated 💜" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// DELETE /api/settings/delete-account
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Password required to delete account" });

    const user = await User.findById(req.user._id).select("+password");
    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: "Password is incorrect" });

    const userId = req.user._id;

    // Hard delete all user data
    await Post.deleteMany({ author: userId });
    await Report.deleteMany({ reportedBy: userId });
    await Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] });
    await Appeal.deleteMany({ user: userId });
    await AdminAction.deleteMany({ targetUser: userId });
    await CheckIn.deleteMany({ user: userId });
    await NotificationToken.deleteMany({ user: userId });
    await UserSettings.deleteMany({ user: userId });

    // Remove user from groups and saved posts
    try {
      const Group = require("../models/Group");
      await Group.updateMany(
        { members: userId },
        { $pull: { members: userId } }
      );
    } catch (e) {}

    // Delete comments/replies by this user in others' posts (soft approach — anonymize)
    await Post.updateMany(
      { "comments.author": userId },
      {
        $set: {
          "comments.$[c].pseudonym": "Deleted User",
          "comments.$[c].text": "This comment was deleted.",
          "comments.$[c].deleted": true,
        },
      },
      { arrayFilters: [{ "c.author": userId }] }
    );

    await Post.updateMany(
      { "comments.replies.author": userId },
      {
        $set: {
          "comments.$[].replies.$[r].pseudonym": "Deleted User",
          "comments.$[].replies.$[r].text": "This reply was deleted.",
          "comments.$[].replies.$[r].deleted": true,
        },
      },
      { arrayFilters: [{ "r.author": userId }] }
    );

    // Finally delete the user
    await User.findByIdAndDelete(userId);

    return res.json({ message: "Account deleted. Goodbye 💜" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// GET /api/settings/report-history
exports.getReportHistory = async (req, res) => {
  try {
    const reports = await Report.find({ reportedBy: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("reason status createdAt postContent postPseudonym");
    return res.json({ reports });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
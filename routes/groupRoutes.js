const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const Group = require("../models/Group");
const GroupPost = require("../models/GroupPost");
const GroupAuditLog = require("../models/GroupAuditLog");
const GroupReport = require("../models/GroupReport");
const User = require("../models/User");
const { analyzeContent } = require("../middleware/contentModerator");
const { sendPushNotification } = require("../utils/sendPush");
const Notification = require("../models/Notification");

const CIRCLE_KEEPER_EMAIL = "mom@gmail.com";
const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ── Membership middleware ──────────────────────────────────────────────────
const requireMember = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const userId = req.user._id.toString();
    const isMember = group.members.some((m) => m.toString() === userId);
    const isRemoved = group.removedMembers.some((m) => m.toString() === userId);

    if (!isMember && !isRemoved) {
      return res.status(403).json({ message: "You must be a member to view this group" });
    }

    req.group = group;
    req.isRemovedMember = isRemoved;
    next();
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// ── Helper: is Circle_Keeper ──────────────────────────────────────────────
const isCircleKeeper = (group, user, userEmail) => {
  const isCreator = group.creator.toString() === user._id.toString();
  const isAdminKeeper = userEmail === CIRCLE_KEEPER_EMAIL;
  return isCreator || isAdminKeeper;
};

// ── Helper: extract @mentions ─────────────────────────────────────────────
function extractMentions(text) {
  const matches = text.match(/@(\w+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

// ── Helper: push setting check ────────────────────────────────────────────
async function getPushEnabled(userId, type) {
  try {
    const UserSettings = require("../models/UserSettings");
    const settings = await UserSettings.findOne({ user: userId });
    if (!settings) return true;
    return settings.pushNotifications?.[type] !== false;
  } catch {
    return true;
  }
}

// ── GET /api/groups ───────────────────────────────────────────────────────
router.get("/", protect, async (req, res) => {
  try {
    const groups = await Group.find().sort({ createdAt: -1 });
    const userId = req.user._id.toString();

    const result = groups.map((g) => {
      const isMember = g.members.some((m) => m.toString() === userId);
      const isRemoved = g.removedMembers.some((m) => m.toString() === userId);

      let unreadCount = 0;
      if (isMember) {
        const lastReadData = g.lastReadAt?.get(userId);
        if (lastReadData) {
          try {
            const parsed = JSON.parse(lastReadData);
            unreadCount = Math.max(0, (g.totalMessages || 0) - (parsed.count || 0));
          } catch (e) {}
        } else {
          unreadCount = g.totalMessages || 0; // Never read = all unread
        }
      }

      return {
        _id: g._id,
        name: g.name,
        topic: g.topic,
        description: g.description,
        icon: g.icon,
        memberCount: g.members.length,
        isMember,
        isRemoved,
        isFull: g.members.length >= 50,
        creatorPseudonym: g.creatorPseudonym,
        isClosed: g.isClosed || false,
        totalMessages: g.totalMessages || 0,
        unreadCount,
        rejoinBlockedUntil: (() => {
          const block = (g.rejoinBlock || []).find((b) => b.user.toString() === userId);
          if (!block || new Date() > new Date(block.unblockAt)) return null;
          return block.unblockAt;
        })(),
      };
    });

    return res.json({ groups: result });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── POST /api/groups ──────────────────────────────────────────────────────
router.post("/", protect, async (req, res) => {
  try {
    const { name, topic, description, icon } = req.body;
    if (!name || !topic)
      return res.status(400).json({ message: "Name and topic are required" });

    const group = await Group.create({
      name, topic, description: description || "", icon: icon || "💜",
      creator: req.user._id, creatorPseudonym: req.user.pseudonym,
      members: [req.user._id],
    });

    return res.status(201).json({ message: "Group created 💜", group });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// Join, Leave, Members, Posts, etc. (your original logic preserved)
router.post("/join/:groupId", protect, async (req, res) => { /* ... your original join logic ... */ });
router.post("/leave/:groupId", protect, async (req, res) => { /* ... your original leave logic ... */ });

// ── MARK GROUP AS READ ────────────────────────────────────────────────────
router.post("/:groupId/mark-read", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    const userId = req.user._id.toString();

    group.lastReadAt.set(userId, JSON.stringify({
      ts: new Date().toISOString(),
      count: group.totalMessages || 0
    }));

    group.markModified("lastReadAt");
    await group.save({ validateBeforeSave: false });

    return res.json({ message: "Group marked as read", unreadCount: 0 });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── POST Message (with unread increment) ─────────────────────────────────
router.post("/:groupId/posts", protect, requireMember, async (req, res) => {
  try {
    if (req.isRemovedMember) {
      return res.status(403).json({ message: "You were removed from this circle." });
    }

    const { content, mood, replyTo } = req.body;
    if (!content) return res.status(400).json({ message: "Content is required" });

    const group = req.group;
    const requestingUser = await User.findById(req.user._id).select("email");
    const keeper = isCircleKeeper(group, req.user, requestingUser?.email);

    if (group.isClosed && !keeper) {
      return res.status(403).json({ message: "This circle is closed." });
    }

    const isMuted = group.isUserMuted(req.user._id);
    if (isMuted && !keeper) {
      return res.status(403).json({ message: "You are muted in this circle." });
    }

    const mod = await analyzeContent(content);
    if (mod.autoReject) {
      return res.status(400).json({ message: "Content violates guidelines." });
    }

    const mentionedNames = extractMentions(content);

    const post = await GroupPost.create({
      group: req.params.groupId,
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      content,
      mood: mood || "hope",
      replyTo: replyTo || null,
    });

    // Increment total messages
    await Group.findByIdAndUpdate(req.params.groupId, { $inc: { totalMessages: 1 } });

    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("group_post_added", {
        groupId: req.params.groupId,
        post: post.toObject(),
      });

      // Notify others for badge update
      req.io.emit("group_new_message", { groupId: req.params.groupId });
    }

    // ... (keep all your existing notification logic: reply, mention, general)

    return res.status(201).json({ message: "Message sent 💜", post });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// Keep all your other routes (edit, delete, mute, remove, pin, audit, report, etc.)
// ... paste the rest of your original routes here ...

module.exports = router;
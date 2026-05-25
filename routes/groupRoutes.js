const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const Group = require("../models/Group");
const GroupPost = require("../models/GroupPost");
const User = require("../models/User");
const { analyzeContent } = require("../middleware/contentModerator");
const { sendPushNotification } = require("../utils/sendPush");
const Notification = require("../models/Notification");

const CIRCLE_KEEPER_EMAIL = "mom@gmail.com";

// ── Membership middleware ──────────────────────────────────────────────────
const requireMember = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    const isMember = group.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (!isMember)
      return res.status(403).json({ message: "You must be a member to view this group" });
    req.group = group;
    next();
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// ── Helper: is this user a Circle_Keeper? ────────────────────────────────
const isCircleKeeper = (group, user, userEmail) => {
  const isCreator = group.creator.toString() === user._id.toString();
  const isAdminKeeper = userEmail === CIRCLE_KEEPER_EMAIL;
  return isCreator || isAdminKeeper;
};

// ── Helper: extract @mentions from text ──────────────────────────────────
function extractMentions(text) {
  const matches = text.match(/@(\w+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

// ── Helper: check user push setting ──────────────────────────────────────
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
    const result = groups.map((g) => ({
      _id: g._id,
      name: g.name,
      topic: g.topic,
      description: g.description,
      icon: g.icon,
      memberCount: g.members.length,
      isMember: g.members.some((m) => m.toString() === req.user._id.toString()),
      isFull: g.members.length >= 50,
      creatorPseudonym: g.creatorPseudonym,
      isClosed: g.isClosed || false,
    }));
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
      name,
      topic,
      description: description || "",
      icon: icon || "💜",
      creator: req.user._id,
      creatorPseudonym: req.user.pseudonym,
      members: [req.user._id],
    });
    return res.status(201).json({ message: "Group created 💜", group });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── POST /api/groups/join/:groupId ────────────────────────────────────────
router.post("/join/:groupId", protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (group.members.length >= 50)
      return res.status(400).json({ message: "This group is full (50 members)" });
    const alreadyMember = group.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (alreadyMember)
      return res.status(400).json({ message: "Already a member" });

    group.members.push(req.user._id);
    await group.save();
    return res.json({ message: `Joined ${group.name} 💜`, memberCount: group.members.length });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── POST /api/groups/leave/:groupId ──────────────────────────────────────
router.post("/leave/:groupId", protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    group.members = group.members.filter(
      (m) => m.toString() !== req.user._id.toString()
    );
    await group.save();
    return res.json({ message: `Left ${group.name}`, memberCount: group.members.length });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── GET /api/groups/:groupId/members ─────────────────────────────────────
// Members only — non-members cannot see the member list
router.get("/:groupId/members", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).populate(
      "members",
      "pseudonym email"
    );
    const members = group.members.map((m) => ({
      _id: m._id,
      pseudonym: m.pseudonym,
      email: m.email,
      isCreator: m._id.toString() === group.creator.toString(),
      isMuted: (group.mutedMembers || []).some(
        (mid) => mid.toString() === m._id.toString()
      ),
    }));
    return res.json({
      members,
      creatorId: group.creator,
      isClosed: group.isClosed || false,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── GET /api/groups/:groupId/posts ────────────────────────────────────────
// Members only — non-members cannot read messages
router.get("/:groupId/posts", protect, requireMember, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const lastId = req.query.lastId;
    const query = { group: req.params.groupId };
    if (lastId) query._id = { $lt: lastId };

    const posts = await GroupPost.find(query)
      .sort({ createdAt: 1 })
      .limit(limit);

    return res.json({ posts });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── POST /api/groups/:groupId/posts ──────────────────────────────────────
router.post("/:groupId/posts", protect, requireMember, async (req, res) => {
  try {
    const { content, mood, replyTo } = req.body;
    if (!content) return res.status(400).json({ message: "Content is required" });

    const group = req.group;

    // Block posting if group is closed (unless Circle_Keeper)
    const requestingUser = await User.findById(req.user._id).select("email");
    const keeper = isCircleKeeper(group, req.user, requestingUser?.email);

    if (group.isClosed && !keeper) {
      return res.status(403).json({ message: "This circle is closed. Posting is paused." });
    }

    // Check if sender is muted
    const isMuted = (group.mutedMembers || []).some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (isMuted && !keeper) {
      return res.status(403).json({ message: "You have been muted in this circle." });
    }

    const mod = await analyzeContent(content);
    if (mod.autoReject) {
      return res.status(400).json({
        message: "Your message violates our community guidelines.",
        flagType: mod.flags[0]?.type,
      });
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

    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("group_post_added", {
        groupId: req.params.groupId,
        post: post.toObject(),
      });
    }

    // ── Reply notification ────────────────────────────────────────────────
    if (replyTo) {
      try {
        const originalPost = await GroupPost.findById(replyTo);
        if (originalPost && originalPost.author.toString() !== req.user._id.toString()) {
          const canPush = await getPushEnabled(originalPost.author, "replies");
          if (canPush) {
            await sendPushNotification(originalPost.author, {
              title: `${req.user.pseudonym} replied to you`,
              body: content.substring(0, 80),
              data: { screen: "GroupChat", groupId: req.params.groupId },
            });
          }
          await Notification.create({
            recipient: originalPost.author,
            sender: req.user._id,
            senderPseudonym: req.user.pseudonym,
            type: "reply",
            post: post._id,
            postPreview: originalPost.content?.substring(0, 60),
            commentText: content.substring(0, 100),
            read: false,
          });
        }
      } catch (e) {
        console.log("Reply notif error:", e.message);
      }
    }

    // ── @mention notifications ─────────────────────────────────────────────
    if (mentionedNames.length > 0) {
      try {
        const groupMembers = await Group.findById(req.params.groupId).populate(
          "members", "pseudonym _id"
        );
        for (const member of groupMembers.members) {
          if (member._id.toString() === req.user._id.toString()) continue;
          const isTagged =
            mentionedNames.includes(member.pseudonym.toLowerCase()) ||
            mentionedNames.includes("all");
          if (!isTagged) continue;

          const canPush = await getPushEnabled(member._id, "mentions");
          if (canPush) {
            await sendPushNotification(member._id, {
              title: `${req.user.pseudonym} mentioned you in ${group.name}`,
              body: content.substring(0, 80),
              data: { screen: "GroupChat", groupId: req.params.groupId },
            });
          }
          await Notification.create({
            recipient: member._id,
            sender: req.user._id,
            senderPseudonym: req.user.pseudonym,
            type: "comment",
            post: post._id,
            postPreview: content.substring(0, 60),
            commentText: `Mentioned you in ${group.name}`,
            read: false,
          });
        }
      } catch (e) {
        console.log("Mention notif error:", e.message);
      }
    }

    // ── General group post notification ───────────────────────────────────
    if (!replyTo && mentionedNames.length === 0) {
      try {
        const otherMembers = group.members
          .filter((m) => m.toString() !== req.user._id.toString())
          .slice(0, 10);
        for (const memberId of otherMembers) {
          const canPush = await getPushEnabled(memberId, "groupPosts");
          if (canPush) {
            await sendPushNotification(memberId, {
              title: `${req.user.pseudonym} posted in ${group.name}`,
              body: content.substring(0, 80),
              data: { screen: "GroupChat", groupId: req.params.groupId },
            });
          }
        }
      } catch (e) {
        console.log("Group post notif error:", e.message);
      }
    }

    const crisisRes = { crisisDetected: mod.crisisDetected };
    if (mod.crisisDetected) {
      crisisRes.crisisMessage =
        "We noticed your message may express thoughts of self-harm. You are not alone 💜";
    }

    return res.status(201).json({ message: "Message sent 💜", post, ...crisisRes });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── DELETE /api/groups/:groupId/posts/:postId — soft delete ──────────────
router.delete("/:groupId/posts/:postId", protect, requireMember, async (req, res) => {
  try {
    const post = await GroupPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }
    post.content = "This message was deleted.";
    post.deleted = true;
    await post.save({ validateBeforeSave: false });

    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("group_post_deleted", {
        groupId: req.params.groupId,
        postId: req.params.postId,
      });
    }
    return res.json({ message: "Message deleted" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── POST /api/groups/:groupId/mute/:userId — Circle_Keeper only ───────────
router.post("/:groupId/mute/:userId", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    const requestingUser = await User.findById(req.user._id).select("email");
    if (!isCircleKeeper(group, req.user, requestingUser?.email)) {
      return res.status(403).json({ message: "Only the Circle_Keeper can mute members" });
    }
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot mute yourself" });
    }
    if (!group.mutedMembers) group.mutedMembers = [];
    const alreadyMuted = group.mutedMembers.some(
      (m) => m.toString() === req.params.userId
    );
    if (!alreadyMuted) {
      group.mutedMembers.push(req.params.userId);
      await group.save();
    }
    return res.json({ message: "Member muted" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── DELETE /api/groups/:groupId/mute/:userId — unmute ─────────────────────
router.delete("/:groupId/mute/:userId", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    const requestingUser = await User.findById(req.user._id).select("email");
    if (!isCircleKeeper(group, req.user, requestingUser?.email)) {
      return res.status(403).json({ message: "Only the Circle_Keeper can unmute members" });
    }
    group.mutedMembers = (group.mutedMembers || []).filter(
      (m) => m.toString() !== req.params.userId
    );
    await group.save();
    return res.json({ message: "Member unmuted" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── DELETE /api/groups/:groupId/members/:userId — remove member ───────────
router.delete("/:groupId/members/:userId", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    const requestingUser = await User.findById(req.user._id).select("email");
    if (!isCircleKeeper(group, req.user, requestingUser?.email)) {
      return res.status(403).json({ message: "Only the Circle_Keeper can remove members" });
    }
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ message: "Circle_Keeper cannot remove themselves" });
    }
    group.members = group.members.filter(
      (m) => m.toString() !== req.params.userId
    );
    await group.save();

    if (req.io) {
      req.io.to(`user:${req.params.userId}`).emit("removed_from_group", {
        groupId: group._id,
        groupName: group.name,
      });
    }
    return res.json({ message: "Member removed from circle" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ── POST /api/groups/:groupId/close — toggle closed ──────────────────────
router.post("/:groupId/close", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    const requestingUser = await User.findById(req.user._id).select("email");
    if (!isCircleKeeper(group, req.user, requestingUser?.email)) {
      return res.status(403).json({ message: "Only the Circle_Keeper can close this circle" });
    }
    group.isClosed = !group.isClosed;
    await group.save();

    if (req.io) {
      req.io.to(`group:${group._id}`).emit("group_closed", {
        groupId: group._id,
        isClosed: group.isClosed,
      });
    }
    return res.json({
      message: group.isClosed ? "Circle closed" : "Circle reopened",
      isClosed: group.isClosed,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
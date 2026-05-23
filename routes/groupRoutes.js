const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const Group = require("../models/Group");
const GroupPost = require("../models/GroupPost");
const User = require("../models/User");
const UserSettings = require("../models/UserSettings");
const { analyzeContent } = require("../middleware/contentModerator");
const { sendPushNotification } = require("../utils/sendPush");
const Notification = require("../models/Notification");

// ── Membership middleware ──────────────────────────────────────────────────
const requireMember = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    const isMember = group.members.some(
      (m) => m.toString() === req.user._id.toString()
    );
    if (!isMember)
      return res.status(403).json({ message: "You are not a member of this group" });
    req.group = group;
    next();
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// ── Helper: extract @mentions from text ───────────────────────────────────
// Returns array of pseudonyms mentioned (without @)
function extractMentions(text) {
  const matches = text.match(/@(\w+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

// ── Helper: check user push setting ───────────────────────────────────────
async function getPushEnabled(userId, type) {
  try {
    const settings = await UserSettings.findOne({ user: userId });
    if (!settings) return true; // default on
    return settings.pushNotifications?.[type] !== false;
  } catch {
    return true;
  }
}

// GET /api/groups — list all groups with membership
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
    }));
    return res.json({ groups: result });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// POST /api/groups — create group
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

// POST /api/groups/join/:groupId
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

    return res.json({
      message: `Joined ${group.name} 💜`,
      memberCount: group.members.length,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// POST /api/groups/leave/:groupId
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

// GET /api/groups/:groupId/members — for mention autocomplete
router.get("/:groupId/members", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).populate(
      "members",
      "pseudonym"
    );
    const members = group.members.map((m) => ({
      _id: m._id,
      pseudonym: m.pseudonym,
    }));
    return res.json({ members });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// GET /api/groups/:groupId/posts
router.get("/:groupId/posts", protect, requireMember, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const lastId = req.query.lastId;
    const query = { group: req.params.groupId };
    deleted: { $ne: true }  // add this
    if (lastId) query._id = { $lt: lastId };

    const posts = await GroupPost.find(query)
      .sort({ createdAt: 1 }) // oldest first — chat style
      .limit(limit);

    return res.json({ posts });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// POST /api/groups/:groupId/posts
router.post("/:groupId/posts", protect, requireMember, async (req, res) => {
  try {
    const { content, mood, replyTo } = req.body;
    if (!content) return res.status(400).json({ message: "Content is required" });

    const mod = await analyzeContent(content);
    if (mod.autoReject) {
      return res.status(400).json({
        message: "Your message violates our community guidelines.",
        flagType: mod.flags[0]?.type,
      });
    }

    const mentionedNames = extractMentions(content);
    const group = req.group;

    const post = await GroupPost.create({
      group: req.params.groupId,
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      content,
      mood: mood || "hope",
      replyTo: replyTo || null,
    });

    // Socket emit
    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("group_post_added", {
        groupId: req.params.groupId,
        post: post.toObject(),
      });
    }

    // Get online users in this room
    const room = req.io?.sockets?.adapter?.rooms?.get(`group:${req.params.groupId}`);
    const onlineUserIds = new Set();
    if (room) {
      for (const sid of room) {
        const s = req.io.sockets.sockets.get(sid);
        if (s?.userId) onlineUserIds.add(s.userId);
      }
    }

    // 1. Reply notification - skip if online
    let originalPost = null;
    if (replyTo) {
      try {
        originalPost = await GroupPost.findById(replyTo);
        if (
          originalPost &&
          originalPost.author.toString()!== req.user._id.toString() &&
         !onlineUserIds.has(originalPost.author.toString())
        ) {
          const canPush = await getPushEnabled(originalPost.author, "replies");
          if (canPush) {
            await sendPushNotification(originalPost.author, {
              title: `${req.user.pseudonym} replied to you`,
              body: content.substring(0, 80),
              data: { screen: "GroupChat", groupId: req.params.groupId, postId: post._id },
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

    // 2. @mention notifications - skip if online
    if (mentionedNames.length > 0) {
      try {
        const groupMembers = await Group.findById(req.params.groupId).populate(
          "members",
          "pseudonym _id"
        );
        for (const member of groupMembers.members) {
          const memberIdStr = member._id.toString();
          if (memberIdStr === req.user._id.toString()) continue;
          if (onlineUserIds.has(memberIdStr)) continue;

          const isTagged =
            mentionedNames.includes(member.pseudonym.toLowerCase()) ||
            mentionedNames.includes("all");

          if (!isTagged) continue;
          if (replyTo && originalPost?.author.toString() === memberIdStr) continue;

          const canPush = await getPushEnabled(member._id, "mentions");
          if (canPush) {
            await sendPushNotification(member._id, {
              title: `${req.user.pseudonym} mentioned you in ${group.name}`,
              body: content.substring(0, 80),
              data: { screen: "GroupChat", groupId: req.params.groupId, postId: post._id },
            });
          }
          await Notification.create({
            recipient: member._id,
            sender: req.user._id,
            senderPseudonym: req.user.pseudonym,
            type: "mention", // changed from "comment"
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

    // 3. General group post notification - skip if online
    if (!replyTo && mentionedNames.length === 0) {
      try {
        const otherMembers = group.members
         .filter((m) => m.toString()!== req.user._id.toString() &&!onlineUserIds.has(m.toString()))
         .slice(0, 10);

        for (const memberId of otherMembers) {
          const canPush = await getPushEnabled(memberId, "groupPosts");
          if (canPush) {
            await sendPushNotification(memberId, {
              title: `${req.user.pseudonym} posted in ${group.name}`,
              body: content.substring(0, 80),
              data: { screen: "GroupChat", groupId: req.params.groupId, postId: post._id },
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

    return res.status(201).json({ message: "Message sent 💜", post,...crisisRes });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});
// DELETE /api/groups/:groupId/posts/:postId — soft delete, author only
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
module.exports = router;
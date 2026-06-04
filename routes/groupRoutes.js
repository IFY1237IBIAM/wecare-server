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
const EDIT_WINDOW_MS = 5 * 60 * 1000;

// ── Membership middleware ──────────────────────────────────────────────────
const requireMember = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const userId = req.user._id.toString();
    const isMember = group.members.some((m) => m.toString() === userId);
    const isRemoved = group.removedMembers.some((m) => m.toString() === userId);

    if (!isMember && !isRemoved) {
      return res
        .status(403)
        .json({ message: "You must be a member to view this group" });
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

// ── Helper: compute mute expiry from duration string ─────────────────────
function getMuteExpiry(duration) {
  if (duration === "permanent") return null;
  const map = {
    "1h":  60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d":  7 * 24 * 60 * 60 * 1000,
  };
  return new Date(Date.now() + (map[duration] || 0));
}

// ── Helper: compute unread count for a user ───────────────────────────────
function getUnreadCount(group, userId) {
  const lastRead = group.lastReadAt?.get(userId);
  if (!lastRead) {
    return group.totalMessages || 0;
  }
  try {
    const parsed =
      typeof lastRead === "string" ? JSON.parse(lastRead) : null;
    if (parsed && parsed.count !== undefined) {
      return Math.max(0, (group.totalMessages || 0) - parsed.count);
    }
    return 0;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", protect, async (req, res) => {
  try {
    const groups = await Group.find().sort({ createdAt: -1 });
    const userId = req.user._id.toString();

    const result = groups.map((g) => {
      const isMember  = g.members.some((m) => m.toString() === userId);
      const isRemoved = g.removedMembers.some((m) => m.toString() === userId);
      const unreadCount = isMember ? getUnreadCount(g, userId) : 0;

      return {
        _id:              g._id,
        name:             g.name,
        topic:            g.topic,
        description:      g.description,
        icon:             g.icon,
        memberCount:      g.members.length,
        isMember,
        isRemoved,
        isFull:           g.members.length >= 50,
        creatorPseudonym: g.creatorPseudonym,
        isClosed:         g.isClosed || false,
        totalMessages:    isMember ? (g.totalMessages || 0) : undefined,
        unreadCount,
        rejoinBlockedUntil: (() => {
          const block = (g.rejoinBlock || []).find(
            (b) => b.user.toString() === userId
          );
          if (!block) return null;
          if (new Date() > new Date(block.unblockAt)) return null;
          return block.unblockAt;
        })(),
      };
    });

    return res.json({ groups: result });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", protect, async (req, res) => {
  try {
    const { name, topic, description, icon } = req.body;
    if (!name || !topic)
      return res.status(400).json({ message: "Name and topic are required" });

    const group = await Group.create({
      name,
      topic,
      description:      description || "",
      icon:             icon || "💜",
      creator:          req.user._id,
      creatorPseudonym: req.user.pseudonym,
      members:          [req.user._id],
    });
    return res.status(201).json({ message: "Group created 💜", group });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/join/:groupId
// ─────────────────────────────────────────────────────────────────────────────
router.post("/join/:groupId", protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const userId = req.user._id.toString();

    const block = (group.rejoinBlock || []).find(
      (b) => b.user.toString() === userId
    );
    if (block && new Date() < new Date(block.unblockAt)) {
      const remaining = Math.ceil(
        (new Date(block.unblockAt) - new Date()) / (1000 * 60 * 60)
      );
      return res.status(403).json({
        message: `You left this circle recently. You can rejoin in ${remaining} hour${remaining !== 1 ? "s" : ""}.`,
        blockedUntil: block.unblockAt,
      });
    }

    if (group.members.length >= 50)
      return res.status(400).json({ message: "This group is full (50 members)" });

    const alreadyMember = group.members.some((m) => m.toString() === userId);
    if (alreadyMember)
      return res.status(400).json({ message: "Already a member" });

    group.members.push(req.user._id);
    group.removedMembers = (group.removedMembers || []).filter(
      (m) => m.toString() !== userId
    );
    await group.save();

    return res.json({
      message:     `Joined ${group.name} 💜`,
      memberCount: group.members.length,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/leave/:groupId
// ─────────────────────────────────────────────────────────────────────────────
router.post("/leave/:groupId", protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const userId = req.user._id.toString();
    group.members = group.members.filter((m) => m.toString() !== userId);

    if (group.lastReadAt) {
      group.lastReadAt.delete(userId);
      group.markModified("lastReadAt");
    }

    group.rejoinBlock = (group.rejoinBlock || []).filter(
      (b) => b.user.toString() !== userId
    );
    group.rejoinBlock.push({
      user:      req.user._id,
      unblockAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await group.save();
    return res.json({
      message:     `Left ${group.name}`,
      memberCount: group.members.length,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/:groupId/mark-read
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:groupId/mark-read", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const userId = req.user._id.toString();

    if (!group.lastReadAt) group.lastReadAt = new Map();
    group.lastReadAt.set(
      userId,
      JSON.stringify({
        ts:    new Date().toISOString(),
        count: group.totalMessages || 0,
      })
    );
    group.markModified("lastReadAt");
    await group.save({ validateBeforeSave: false });

    return res.json({
      message:       "Marked as read",
      totalMessages: group.totalMessages || 0,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups/:groupId/members
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:groupId/members", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).populate(
      "members",
      "pseudonym email"
    );

    const members = group.members.map((m) => {
      const muteInfo         = group.getMuteInfo(m._id);
      const isCurrentlyMuted = group.isUserMuted(m._id);
      return {
        _id:           m._id,
        pseudonym:     m.pseudonym,
        email:         m.email,
        isCreator:     m._id.toString() === group.creator.toString(),
        isMuted:       isCurrentlyMuted,
        muteReason:    isCurrentlyMuted ? muteInfo?.reason    : null,
        muteDuration:  isCurrentlyMuted ? muteInfo?.duration  : null,
        muteExpiresAt: isCurrentlyMuted ? muteInfo?.expiresAt : null,
      };
    });

    return res.json({
      members,
      creatorId:     group.creator,
      isClosed:      group.isClosed || false,
      pinnedMessage: group.pinnedMessage || null,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups/:groupId/posts
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:groupId/posts", protect, requireMember, async (req, res) => {
  try {
    const limit   = parseInt(req.query.limit) || 30;
    const firstId = req.query.firstId;
    const query   = { group: req.params.groupId };
    if (firstId) query._id = { $lt: firstId };

    const posts = await GroupPost.find(query)
      .sort({ createdAt: firstId ? -1 : 1 })
      .limit(limit);

    const userId = req.user._id.toString();
    const undelivered = posts.filter(
      (p) =>
        !p.deliveredTo.some((d) => d.toString() === userId) &&
        p.author.toString() !== userId
    );

    if (undelivered.length > 0) {
      await GroupPost.updateMany(
        { _id: { $in: undelivered.map((p) => p._id) } },
        { $addToSet: { deliveredTo: req.user._id } }
      );
      if (req.io) {
        undelivered.forEach((p) => {
          req.io.to(`group:${req.params.groupId}`).emit("message_delivered", {
            groupId: req.params.groupId,
            postId:  p._id,
            userId:  req.user._id,
          });
        });
      }
    }

    return res.json({
      posts:           firstId ? posts.reverse() : posts,
      isRemovedMember: req.isRemovedMember,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/:groupId/posts
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:groupId/posts", protect, requireMember, async (req, res) => {
  try {
    if (req.isRemovedMember) {
      return res
        .status(403)
        .json({ message: "You were removed from this circle by the Circle_Keeper." });
    }

    const { content, mood, replyTo } = req.body;
    if (!content) return res.status(400).json({ message: "Content is required" });

    const group = req.group;
    const requestingUser = await User.findById(req.user._id).select("email");
    const keeper = isCircleKeeper(group, req.user, requestingUser?.email);

    if (group.isClosed && !keeper) {
      return res
        .status(403)
        .json({ message: "This circle is closed. Posting is paused." });
    }

    const isMuted = group.isUserMuted(req.user._id);
    if (isMuted && !keeper) {
      const muteInfo = group.getMuteInfo(req.user._id);
      return res.status(403).json({
        message:       "You have been muted in this circle.",
        muteReason:    muteInfo?.reason    || "",
        muteExpiresAt: muteInfo?.expiresAt || null,
      });
    }

    const mod = await analyzeContent(content);
    if (mod.autoReject) {
      return res.status(400).json({
        message:  "Your message violates our community guidelines.",
        flagType: mod.flags[0]?.type,
      });
    }

    const mentionedNames = extractMentions(content);

    const post = await GroupPost.create({
      group:     req.params.groupId,
      author:    req.user._id,
      pseudonym: req.user.pseudonym,
      content,
      mood:    mood || "hope",
      replyTo: replyTo || null,
    });

    await Group.findByIdAndUpdate(req.params.groupId, {
      $inc: { totalMessages: 1 },
    });

    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("group_post_added", {
        groupId: req.params.groupId,
        post:    post.toObject(),
      });
      req.io.emit("group_new_message", {
        groupId:      req.params.groupId,
        senderUserId: req.user._id.toString(),
      });
    }

    // ── Reply notification ────────────────────────────────────────────────
    if (replyTo) {
      try {
        const originalPost = await GroupPost.findById(replyTo);
        if (
          originalPost &&
          originalPost.author.toString() !== req.user._id.toString()
        ) {
          const canPush = await getPushEnabled(originalPost.author, "replies");
          if (canPush) {
            await sendPushNotification(originalPost.author, {
              title: `${req.user.pseudonym} replied to you`,
              body:  content.substring(0, 80),
              data:  { screen: "GroupChat", groupId: req.params.groupId },
            });
          }
          await Notification.create({
            recipient:       originalPost.author,
            sender:          req.user._id,
            senderPseudonym: req.user.pseudonym,
            type:            "reply",
            post:            post._id,
            postPreview:     originalPost.content?.substring(0, 60),
            commentText:     content.substring(0, 100),
            read:            false,
          });
        }
      } catch (e) {
        console.log("Reply notif error:", e.message);
      }
    }

    // ── @mention / @all notifications ─────────────────────────────────────
    if (mentionedNames.length > 0) {
      try {
        const groupDoc = await Group.findById(req.params.groupId).populate(
          "members",
          "pseudonym _id"
        );
        for (const member of groupDoc.members) {
          if (member._id.toString() === req.user._id.toString()) continue;
          const isTagged =
            mentionedNames.includes(member.pseudonym.toLowerCase()) ||
            mentionedNames.includes("all");
          if (!isTagged) continue;

          const canPush = await getPushEnabled(member._id, "mentions");
          if (canPush) {
            await sendPushNotification(member._id, {
              title: `${req.user.pseudonym} mentioned you in ${group.name}`,
              body:  content.substring(0, 80),
              data:  { screen: "GroupChat", groupId: req.params.groupId },
            });
          }
        }
      } catch (e) {
        console.log("Mention notif error:", e.message);
      }
    }

    // ── General group-post notification (all members, no slice limit) ─────
    if (!replyTo && mentionedNames.length === 0) {
      try {
        const otherMembers = group.members.filter(
          (m) => m.toString() !== req.user._id.toString()
        );
        for (const memberId of otherMembers) {
          const canPush = await getPushEnabled(memberId, "groupPosts");
          if (canPush) {
            await sendPushNotification(memberId, {
              title: `${req.user.pseudonym} posted in ${group.name}`,
              body:  content.substring(0, 80),
              data:  { screen: "GroupChat", groupId: req.params.groupId },
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

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/groups/:groupId/posts/:postId — edit message (5-min window)
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:groupId/posts/:postId", protect, requireMember, async (req, res) => {
  try {
    if (req.isRemovedMember)
      return res.status(403).json({ message: "You are not a member." });

    const { content } = req.body;
    if (!content?.trim())
      return res.status(400).json({ message: "Content is required" });

    const post = await GroupPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.author.toString() !== req.user._id.toString())
      return res
        .status(403)
        .json({ message: "Not authorized to edit this message" });

    if (Date.now() - new Date(post.createdAt).getTime() > EDIT_WINDOW_MS) {
      return res
        .status(403)
        .json({ message: "Edit window has expired (5 minutes)" });
    }

    const mod = await analyzeContent(content);
    if (mod.autoReject)
      return res
        .status(400)
        .json({ message: "Content violates community guidelines." });

    post.editHistory = [
      ...(post.editHistory || []),
      { content: post.content, editedAt: new Date() },
    ];
    post.content  = content.trim();
    post.isEdited = true;
    post.editedAt = new Date();
    await post.save({ validateBeforeSave: false });

    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("group_post_edited", {
        groupId:  req.params.groupId,
        postId:   post._id,
        content:  post.content,
        isEdited: true,
        editedAt: post.editedAt,
      });
    }

    await GroupAuditLog.create({
      group:                req.params.groupId,
      performedBy:          req.user._id,
      performedByPseudonym: req.user.pseudonym,
      action:               "edit_message",
      targetPost:           post._id,
    });

    return res.json({ message: "Message updated", post });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/groups/:groupId/posts/:postId — soft delete
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:groupId/posts/:postId", protect, requireMember, async (req, res) => {
  try {
    const post = await GroupPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const isAuthor = post.author.toString() === req.user._id.toString();
    const requestingUser = await User.findById(req.user._id).select("email");
    const keeper = isCircleKeeper(req.group, req.user, requestingUser?.email);

    if (!keeper) {
      if (!isAuthor)
        return res.status(403).json({ message: "Not authorized" });
      if (Date.now() - new Date(post.createdAt).getTime() > EDIT_WINDOW_MS) {
        return res
          .status(403)
          .json({ message: "Delete window has expired (5 minutes)" });
      }
    }

    post.content            = "This message was deleted.";
    post.deleted            = true;
    post.deletedBy          = isAuthor ? "self" : "Crown_Keeper";
    post.deletedByPseudonym = isAuthor ? null : req.user.pseudonym;
    await post.save({ validateBeforeSave: false });

    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("group_post_deleted", {
        groupId:            req.params.groupId,
        postId:             req.params.postId,
        deletedBy:          isAuthor ? "self" : "Crown_Keeper",
        deletedByPseudonym: isAuthor ? null : req.user.pseudonym,
      });
    }

    await GroupAuditLog.create({
      group:                req.params.groupId,
      performedBy:          req.user._id,
      performedByPseudonym: req.user.pseudonym,
      action:               "delete_message",
      targetPost:           post._id,
    });

    return res.json({ message: "Message deleted" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/:groupId/posts/:postId/read
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:groupId/posts/:postId/read",
  protect,
  requireMember,
  async (req, res) => {
    try {
      const post = await GroupPost.findById(req.params.postId);
      if (!post) return res.status(404).json({ message: "Post not found" });

      await GroupPost.updateOne(
        { _id: post._id },
        { $addToSet: { readBy: req.user._id, deliveredTo: req.user._id } }
      );

      if (req.io) {
        req.io.to(`group:${req.params.groupId}`).emit("message_read", {
          groupId:   req.params.groupId,
          postId:    post._id,
          userId:    req.user._id,
          pseudonym: req.user.pseudonym,
        });
      }

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups/:groupId/posts/:postId/info
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/:groupId/posts/:postId/info",
  protect,
  requireMember,
  async (req, res) => {
    try {
      const post = await GroupPost.findById(req.params.postId)
        .populate("readBy",      "pseudonym")
        .populate("deliveredTo", "pseudonym");
      if (!post) return res.status(404).json({ message: "Post not found" });
      if (post.author.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: "Only the message author can view this" });
      }

      return res.json({
        sentAt:      post.createdAt,
        readBy:      post.readBy,
        deliveredTo: post.deliveredTo,
      });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/:groupId/mute/:userId — Circle_Keeper only
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:groupId/mute/:userId", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    const requestingUser = await User.findById(req.user._id).select("email");
    if (!isCircleKeeper(group, req.user, requestingUser?.email))
      return res
        .status(403)
        .json({ message: "Only the Circle_Keeper can mute members" });
    if (req.params.userId === req.user._id.toString())
      return res.status(400).json({ message: "You cannot mute yourself" });

    const { reason = "", duration = "permanent" } = req.body;
    const expiresAt = getMuteExpiry(duration);

    group.mutedMembers = (group.mutedMembers || []).filter(
      (m) => m.user.toString() !== req.params.userId
    );
    group.mutedMembers.push({
      user:     req.params.userId,
      reason,
      duration,
      mutedAt:  new Date(),
      expiresAt,
    });
    await group.save();

    try {
      const durationLabel =
        duration === "permanent" ? "indefinitely" :
        duration === "1h"        ? "for 1 hour"   :
        duration === "24h"       ? "for 24 hours"  :
                                   "for 7 days";
      await sendPushNotification(req.params.userId, {
        title: `You've been muted in ${group.name}`,
        body:  `You cannot send messages ${durationLabel}${reason ? `. Reason: ${reason}` : "."}`,
        data:  { screen: "GroupChat", groupId: req.params.groupId },
      });
    } catch (e) {
      console.log("Mute notif error:", e.message);
    }

    const targetUser = await User.findById(req.params.userId).select("pseudonym");
    await GroupAuditLog.create({
      group:                req.params.groupId,
      performedBy:          req.user._id,
      performedByPseudonym: req.user.pseudonym,
      action:               "mute_member",
      targetUser:           req.params.userId,
      targetUserPseudonym:  targetUser?.pseudonym,
      reason,
      duration,
    });

    return res.json({ message: "Member muted", expiresAt });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/groups/:groupId/mute/:userId — unmute
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:groupId/mute/:userId", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    const requestingUser = await User.findById(req.user._id).select("email");
    if (!isCircleKeeper(group, req.user, requestingUser?.email))
      return res
        .status(403)
        .json({ message: "Only the Circle_Keeper can unmute members" });

    group.mutedMembers = (group.mutedMembers || []).filter(
      (m) => m.user.toString() !== req.params.userId
    );
    await group.save();

    const targetUser = await User.findById(req.params.userId).select("pseudonym");
    await GroupAuditLog.create({
      group:                req.params.groupId,
      performedBy:          req.user._id,
      performedByPseudonym: req.user.pseudonym,
      action:               "unmute_member",
      targetUser:           req.params.userId,
      targetUserPseudonym:  targetUser?.pseudonym,
    });

    return res.json({ message: "Member unmuted" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/groups/:groupId/members/:userId — remove member
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/:groupId/members/:userId",
  protect,
  requireMember,
  async (req, res) => {
    try {
      const group = await Group.findById(req.params.groupId);
      const requestingUser = await User.findById(req.user._id).select("email");
      if (!isCircleKeeper(group, req.user, requestingUser?.email))
        return res
          .status(403)
          .json({ message: "Only the Circle_Keeper can remove members" });
      if (req.params.userId === req.user._id.toString())
        return res
          .status(400)
          .json({ message: "Circle_Keeper cannot remove themselves" });

      group.members = group.members.filter(
        (m) => m.toString() !== req.params.userId
      );
      if (
        !group.removedMembers.some((m) => m.toString() === req.params.userId)
      ) {
        group.removedMembers.push(req.params.userId);
      }

      if (group.lastReadAt) {
        group.lastReadAt.delete(req.params.userId);
        group.markModified("lastReadAt");
      }

      await group.save();

      if (req.io) {
        req.io.to(`user:${req.params.userId}`).emit("removed_from_group", {
          groupId:   group._id,
          groupName: group.name,
        });
      }

      const targetUser = await User.findById(req.params.userId).select("pseudonym");
      await GroupAuditLog.create({
        group:                req.params.groupId,
        performedBy:          req.user._id,
        performedByPseudonym: req.user.pseudonym,
        action:               "remove_member",
        targetUser:           req.params.userId,
        targetUserPseudonym:  targetUser?.pseudonym,
        reason:               req.body.reason || "",
      });

      return res.json({ message: "Member removed from circle" });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/:groupId/close — toggle circle closed/open
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:groupId/close", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    const requestingUser = await User.findById(req.user._id).select("email");
    if (!isCircleKeeper(group, req.user, requestingUser?.email))
      return res
        .status(403)
        .json({ message: "Only the Circle_Keeper can close this circle" });

    group.isClosed = !group.isClosed;
    await group.save();

    if (req.io) {
      req.io.to(`group:${group._id}`).emit("group_closed", {
        groupId:  group._id,
        isClosed: group.isClosed,
      });
    }

    await GroupAuditLog.create({
      group:                req.params.groupId,
      performedBy:          req.user._id,
      performedByPseudonym: req.user.pseudonym,
      action:               group.isClosed ? "close_circle" : "reopen_circle",
    });

    return res.json({
      message:  group.isClosed ? "Circle closed" : "Circle reopened",
      isClosed: group.isClosed,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/:groupId/pin — pin / unpin a message
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:groupId/pin", protect, requireMember, async (req, res) => {
  try {
    if (req.isRemovedMember)
      return res.status(403).json({ message: "You are not a member." });

    const group = await Group.findById(req.params.groupId);
    const { content, postId, duration } = req.body;

    const pinExpiresAt = (() => {
      if (!content || !duration || duration === "permanent") return null;
      const map = { "24h": 24, "3d": 72, "7d": 168 };
      const hours = map[duration];
      if (!hours) return null;
      return new Date(Date.now() + hours * 60 * 60 * 1000);
    })();

    group.pinnedMessage = content
      ? {
          content,
          pinnedBy:          req.user._id.toString(),
          pinnedByPseudonym: req.user.pseudonym,
          pinnedAt:          new Date(),
          postId:            postId || null,
          expiresAt:         pinExpiresAt,
          duration:          duration || "permanent",
        }
      : {
          content:           null,
          pinnedBy:          null,
          pinnedByPseudonym: null,
          pinnedAt:          null,
          postId:            null,
          expiresAt:         null,
          duration:          null,
        };

    await group.save();

    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("pinned_message_updated", {
        groupId:       req.params.groupId,
        pinnedMessage: group.pinnedMessage,
      });
    }

    await GroupAuditLog.create({
      group:                req.params.groupId,
      performedBy:          req.user._id,
      performedByPseudonym: req.user.pseudonym,
      action:               content ? "pin_message" : "unpin_message",
      meta:                 { content },
    });

    return res.json({
      message:       content ? "Message pinned" : "Pin removed",
      pinnedMessage: group.pinnedMessage,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups/:groupId/audit — Circle_Keeper only
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:groupId/audit", protect, requireMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    const requestingUser = await User.findById(req.user._id).select("email");
    if (!isCircleKeeper(group, req.user, requestingUser?.email))
      return res
        .status(403)
        .json({ message: "Only the Circle_Keeper can view the audit log" });

    const logs = await GroupAuditLog.find({ group: req.params.groupId })
      .sort({ createdAt: -1 })
      .limit(50);
    return res.json({ logs });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/:groupId/report/:userId — report a member
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/:groupId/report/:userId",
  protect,
  requireMember,
  async (req, res) => {
    try {
      const { reason, details, postContext } = req.body;
      if (!reason)
        return res.status(400).json({ message: "Reason is required" });

      const group = await Group.findById(req.params.groupId);
      const targetUser = await User.findById(req.params.userId).select(
        "pseudonym"
      );
      if (!targetUser)
        return res.status(404).json({ message: "User not found" });

      await GroupReport.create({
        group:               req.params.groupId,
        groupName:           group.name,
        reportedBy:          req.user._id,
        reportedByPseudonym: req.user.pseudonym,
        targetUser:          req.params.userId,
        targetUserPseudonym: targetUser.pseudonym,
        reason,
        details:             details || "",
        postContext:         postContext || "",
      });

      return res.status(201).json({
        message: "Report submitted. Thank you for keeping this circle safe 💜",
      });
    } catch (e) {
      return res.status(500).json({ message: e.message });
    }
  }
);

module.exports = router;
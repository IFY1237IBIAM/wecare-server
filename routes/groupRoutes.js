const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const Group = require("../models/Group");
const GroupPost = require("../models/GroupPost");
const User = require("../models/User");
const { analyzeContent } = require("../middleware/contentModerator");
const { sendPushNotification } = require("../utils/sendPush");
const Notification = require("../models/Notification");

// Middleware — check member and not banned
const requireMember = async (req, res, next) => {
  try {
    if (req.user.isBanned) {
      return res.status(403).json({ message: "Your account is restricted" });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    
    const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ message: "You are not a member of this group" });
    
    req.group = group;
    next();
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// GET /api/groups — list all groups with membership status
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

// POST /api/groups — create a group
router.post("/", protect, async (req, res) => {
  try {
    if (req.user.isBanned) {
      return res.status(403).json({ message: "Your account is restricted" });
    }

    const { name, topic, description, icon } = req.body;
    if (!name || !topic) return res.status(400).json({ message: "Name and topic are required" });
    if (name.length > 50) return res.status(400).json({ message: "Group name too long" });

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
    if (req.user.isBanned) {
      return res.status(403).json({ message: "Your account is restricted" });
    }

    const group = await Group.findOneAndUpdate(
      { 
        _id: req.params.groupId, 
        $expr: { $lt: [{ $size: "$members" }, 50] },
        members: { $ne: req.user._id }
      },
      { $push: { members: req.user._id } },
      { new: true }
    );

    if (!group) {
      const checkGroup = await Group.findById(req.params.groupId);
      if (!checkGroup) return res.status(404).json({ message: "Group not found" });
      if (checkGroup.members.some(m => m.toString() === req.user._id.toString())) {
        return res.status(400).json({ message: "Already a member" });
      }
      return res.status(400).json({ message: "This group is full (50 members)" });
    }

    // Notify group creator
    if (group.creator.toString() !== req.user._id.toString()) {
      sendPushNotification(group.creator, {
        title: `${req.user.pseudonym} joined ${group.name}`,
        body: `Your group now has ${group.members.length} members 💜`,
        data: { screen: "Groups", groupId: group._id.toString() },
      }).catch(err => console.log("Push error:", err.message));
    }

    return res.json({ message: `Joined ${group.name} 💜`, memberCount: group.members.length });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// POST /api/groups/leave/:groupId
router.post("/leave/:groupId", protect, async (req, res) => {
  try {
    const group = await Group.findByIdAndUpdate(
      req.params.groupId,
      { $pull: { members: req.user._id } },
      { new: true }
    );
    
    if (!group) return res.status(404).json({ message: "Group not found" });

    return res.json({ message: `Left ${group.name}`, memberCount: group.members.length });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// GET /api/groups/:groupId/posts — members only
router.get("/:groupId/posts", protect, requireMember, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const lastId = req.query.lastId;
    const query = { group: req.params.groupId };
    if (lastId) query._id = { $lt: lastId };

    const posts = await GroupPost.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-author"); // hide author ID, keep pseudonym

    return res.json({ posts });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// POST /api/groups/:groupId/posts — members only
router.post("/:groupId/posts", protect, requireMember, async (req, res) => {
  try {
    const { content, mood } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }
    if (content.length > 500) {
      return res.status(400).json({ message: "Max 500 characters" });
    }

    const mod = await analyzeContent(content);
    if (mod.autoReject) {
      return res.status(400).json({
        message: "Your post contains content that violates our community guidelines.",
        flagType: mod.flags[0]?.type,
      });
    }

    const post = await GroupPost.create({
      group: req.params.groupId,
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      content: content.trim(),
      mood: mood || "hope",
    });

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("group_post_added", {
        groupId: req.params.groupId,
        post: post.toObject(),
      });
    }

    // Notify group members, don't await to avoid timeout
    const group = req.group;
    const otherMembers = group.members
      .filter((m) => m.toString() !== req.user._id.toString())
      .slice(0, 15); // limit to 15 to avoid spam

    const pushPromises = otherMembers.map(memberId =>
      sendPushNotification(memberId, {
        title: `${req.user.pseudonym} posted in ${group.name}`,
        body: content.substring(0, 80),
        data: {
          screen: "GroupChat",
          groupId: group._id.toString(),
          postId: post._id.toString(),
        },
      }).catch(err => console.log("Push error:", err.message))
    );
    
    Promise.allSettled(pushPromises);

    const modRes = { crisisDetected: mod.crisisDetected };
    if (mod.crisisDetected) {
      modRes.crisisMessage = "We noticed your post may be expressing thoughts of self-harm. You are not alone 💜";
      modRes.crisisResources = [
        { name: "Befrienders Worldwide", url: "https://www.befrienders.org" },
        { name: "Crisis Text Line", info: "Text HOME to 741" },
      ];
    }

    return res.status(201).json({ message: "Post shared 💜", post, ...modRes });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// POST /api/groups/:groupId/posts/:postId/comments
router.post("/:groupId/posts/:postId/comments", protect, requireMember, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: "Comment text required" });
    if (text.length > 300) return res.status(400).json({ message: "Max 300 characters" });

    const mod = await analyzeContent(text);
    if (mod.autoReject) return res.status(400).json({ message: "Comment violates community guidelines." });

    const post = await GroupPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const isPostAuthor = post.author.toString() === req.user._id.toString();
    post.comments.push({
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      text: text.trim(),
      isPostAuthor,
    });
    await post.save({ validateBeforeSave: false });

    const newComment = post.comments[post.comments.length - 1];

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.to(`group:${req.params.groupId}`).emit("group_comment_added", {
        groupId: req.params.groupId,
        postId: req.params.postId,
        comment: newComment.toObject(),
      });
    }

    // Notify post author
    if (post.author.toString() !== req.user._id.toString()) {
      sendPushNotification(post.author, {
        title: `${req.user.pseudonym} commented in ${req.group.name}`,
        body: text.substring(0, 80),
        data: {
          screen: "GroupChat",
          groupId: req.params.groupId,
          postId: req.params.postId,
        },
      }).catch(err => console.log("Push error:", err.message));

      await Notification.create({
        recipient: post.author,
        sender: req.user._id,
        senderPseudonym: req.user.pseudonym,
        type: "comment",
        post: post._id,
        postPreview: post.content?.substring(0, 60),
        commentText: text.substring(0, 100),
        read: false,
      });
    }

    return res.status(201).json({ message: "Comment added 💜", comment: newComment });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// POST /api/groups/:groupId/posts/:postId/react
router.post("/:groupId/posts/:postId/react", protect, requireMember, async (req, res) => {
  try {
    const { type } = req.body; // care, heart, hug, strong, cry, hope
    const post = await GroupPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Remove existing reaction from user
    post.reactions = post.reactions.filter(r => !r.user.equals(req.user._id));
    
    // Add new reaction if type provided
    if (type) {
      post.reactions.push({ user: req.user._id, type });
    }
    
    await post.save();

    // Notify post author
    if (!post.author.equals(req.user._id) && type) {
      sendPushNotification(post.author, {
        title: `${req.user.pseudonym} reacted to your post`,
        body: type,
        data: {
          screen: "GroupChat",
          groupId: req.params.groupId,
          postId: post._id.toString(),
        },
      }).catch(err => console.log("Push error:", err.message));
    }

    return res.json({ reactions: post.reactions });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
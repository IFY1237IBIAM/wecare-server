const Post = require("../models/Post");
const Report = require("../models/Report");
const { analyzeContent } = require("../middleware/contentModerator");
const Notification = require("../models/Notification");
const { sendPushNotification } = require("../utils/sendPush");


// @route POST /api/posts
exports.createPost = async (req, res) => {
  try {
    const { content, mood } = req.body;

    if (!content ||!content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    const modResult = await analyzeContent(content);

    if (modResult.autoReject) {
      return res.status(400).json({
        message: "Your post could not be shared as it may contain harmful content. Please review our community guidelines.",
        flagType: modResult.flags[0]?.type,
      });
    }

    // Extract hashtags from content — max 5, lowercase, deduplicate
    const extracted = (content.match(/#\w+/g) || [])
     .map((t) => t.toLowerCase())
     .filter((t) => t.length <= 32)
     .slice(0, 5);
    const hashtags = [...new Set(extracted)];
   
    // Calculate if translation is needed
  
    const post = await Post.create({
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      content: content.trim(),
      mood: mood || "sadness",
      hashtags,
      flagged: modResult.flags.length > 0,
      flagType: modResult.flags[0]?.type || null,
   
    });

    const obj = post.toObject();
    const reactions = Array.isArray(obj.reactions)? obj.reactions : [];
    const reactionCounts = {};
    reactions.forEach((r) => {
      if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
    });

    const response = {
      message: "Post shared 💜",
      post: {...obj, reactions, reactionCounts, totalReactions: reactions.length },
      crisisDetected: modResult.crisisDetected,
      autoFlagged: modResult.flags.length > 0,
    };

    if (modResult.crisisDetected) {
      response.crisisMessage = "We noticed your post may be expressing thoughts of self-harm. You are not alone 💜";
      response.crisisResources = [
        { name: "International Association for Suicide Prevention", url: "https://www.iasp.info/resources/Crisis_Centres/" },
        { name: "Crisis Text Line", info: "Text HOME to 741 (US)" },
        { name: "Befrienders Worldwide", url: "https://www.befrienders.org" },
      ];
    }

    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/posts
// @route GET /api/posts
// @route GET /api/posts
exports.getFeed = async (req, res) => {
  try {
    const User = require("../models/User");
    const limit = parseInt(req.query.limit) || 15;
    const lastId = req.query.lastId;
    const userId = req.user._id;

    // Get user's saved posts once
    const user = await User.findById(userId).select("savedPosts");
    const savedSet = new Set(user.savedPosts.map(id => id.toString()));

    const query = {
      author: { $ne: userId }, // hide own posts
    };
    if (lastId) query._id = { $lt: lastId };

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(); // use lean so we can add fields easily

    const postsWithReactions = posts.map((post) => {
      const reactions = Array.isArray(post.reactions) ? post.reactions : [];

      const reactionCounts = {};
      reactions.forEach((r) => {
        if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
      });

      const userReactionObj = reactions.find(r => r.user && r.user.toString() === userId.toString());

      return {
        ...post,
        reactions,
        reactionCounts,
        totalReactions: reactions.length,
        authorId: post.author?.toString(),
        userReaction: userReactionObj?.type || null,
        hasReacted: !!userReactionObj,
        isSaved: savedSet.has(post._id.toString()) // <-- add this
      };
    });

    return res.json({ posts: postsWithReactions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


// NEW: @route GET /api/posts/hashtag/:tag
// NEW: @route GET /api/posts/hashtag/:tag
exports.getPostsByHashtag = async (req, res) => {
  try {
    let tag = req.params.tag.toLowerCase();
    if (!tag.startsWith("#")) tag = `#${tag}`;

    const limit = parseInt(req.query.limit) || 15;
    const lastId = req.query.lastId;
    const userId = req.user._id.toString(); // <-- add this

    const query = { hashtags: tag };
    if (lastId) query._id = { $lt: lastId };

    const posts = await Post.find(query)
     .sort({ createdAt: -1 })
     .limit(limit)
     .select("-author");

    const postsWithReactions = posts.map((post) => {
      const obj = post.toObject();
      const reactions = Array.isArray(obj.reactions)? obj.reactions : [];
      
      const reactionCounts = {};
      reactions.forEach((r) => {
        if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
      });

      const userReactionObj = reactions.find(r => r.user && r.user.toString() === userId); // <-- add this

      return {
        ...obj, 
        reactions, 
        reactionCounts, 
        totalReactions: reactions.length,
        authorId: obj.author?.toString(),
        userReaction: userReactionObj?.type || null, // <-- add this
        hasReacted:!!userReactionObj, // <-- add this
      };
    });

    return res.json({
      posts: postsWithReactions,
      tag,
      count: postsWithReactions.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/posts/:id/react
exports.reactToPost = async (req, res) => {
  try {
    const { type } = req.body;
    const validTypes = ["care", "heart", "hug", "strong", "cry", "hope"];

    if (!type ||!validTypes.includes(type)) {
      return res.status(400).json({ message: "Invalid reaction type" });
    }

    await Post.updateOne(
      { _id: req.params.id, $nor: [{ reactions: { $type: "array" } }] },
      { $set: { reactions: [] } }
    );

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (!Array.isArray(post.reactions)) post.reactions = [];

    const userId = req.user._id.toString();
    const existingIndex = post.reactions.findIndex(r => r.user && r.user.toString() === userId);

    if (existingIndex!== -1) {
      if (post.reactions[existingIndex].type === type) {
        post.reactions.splice(existingIndex, 1);
      } else {
        post.reactions[existingIndex].type = type;
      }
    } else {
      post.reactions.push({ user: req.user._id, type });
    }

    await post.save({ validateBeforeSave: false });

    // Create notification for post author
try {
  const freshPost = await Post.findById(req.params.id).select("author pseudonym content");
  if (freshPost && freshPost.author.toString() !== req.user._id.toString()) {
    await Notification.deleteOne({
      recipient: freshPost.author,
      sender: req.user._id,
      post: req.params.id,
      type: "reaction",
    });

    if (existingIndex === -1 || post.reactions.find(r => r.user && r.user.toString() === userId)) {
      const newReaction = post.reactions.find(r => r.user && r.user.toString() === userId);
      if (newReaction) {
        await Notification.create({
          recipient: freshPost.author,
          sender: req.user._id,
          senderPseudonym: req.user.pseudonym,
          type: "reaction",
          post: req.params.id,
          postPreview: freshPost.content?.substring(0, 60),
          reactionType: newReaction.type,
        });

        // ADD THIS:
        await sendPushNotification(freshPost.author, {
          title: `${req.user.pseudonym} reacted to your post`,
          body: newReaction.type,
          data: { 
            screen: "Feed", 
            postId: req.params.id.toString(),
            type: "reaction"
          }
        });
      }
    }
  }
} catch (e) {
  console.log("Notification error:", e.message);
}
    const reactionCounts = {};
    post.reactions.forEach((r) => {
      if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
    });

    const userReaction = post.reactions.find(r => r.user && r.user.toString() === userId);

    const payload = {
      postId: req.params.id,
      reactionCounts,
      totalReactions: post.reactions.length,
      userReaction: userReaction?.type || null,
    };

    if (req.io) {
      req.io.to(`post:${req.params.id}`).emit("reaction_updated", payload);
    }

    return res.json({
      message: "Reaction updated 💜",
     ...payload
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/posts/:id/comments
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Comment text is required" });

    const { analyzeContent } = require("../middleware/contentModerator");
    const modResult = await analyzeContent(text);
    if (modResult.autoReject) {
      return res.status(400).json({ message: "Comment violates community guidelines." });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const isPostAuthor = post.author.toString() === req.user._id.toString();

    const updated = await Post.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          comments: {
            author: req.user._id,
            pseudonym: req.user.pseudonym,
            text,
            isPostAuthor,
            createdAt: new Date(),
          },
        },
        $inc: { commentCount: 1 }, // ← increment
      },
      { new: true, runValidators: false }
    );

    const newComment = updated.comments[updated.comments.length - 1];

    const payload = {
      postId: req.params.id,
      comment: { ...newComment.toObject(), replies: [] },
      totalComments: updated.commentCount,
    };

    if (req.io) {
      req.io.to(`post:${req.params.id}`).emit("comment_added", payload);
    }

    // Notify post author
    try {
      if (post.author.toString() !== req.user._id.toString()) {
        const Notification = require("../models/Notification");
        await Notification.create({
          recipient: post.author,
          sender: req.user._id,
          senderPseudonym: req.user.pseudonym,
          type: "comment",
          post: post._id,
          postPreview: post.content?.substring(0, 60),
          commentText: text.substring(0, 100),
        });

        const { sendPushNotification } = require("../utils/sendPush");
        await sendPushNotification(post.author, {
          title: `${req.user.pseudonym} commented on your post`,
          body: text.substring(0, 80),
          data: { screen: "Feed", postId: post._id.toString() },
        });
      }
    } catch (e) {
      console.log("Comment notification error:", e.message);
    }

    return res.status(201).json({
      message: "Comment added 💜",
      comment: newComment,
      commentCount: updated.commentCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/posts/:id/comments/:commentId/replies
exports.addReply = async (req, res) => {
  try {
    const { text, replyingTo } = req.body;
    if (!text) return res.status(400).json({ message: "Reply text is required" });

    const { analyzeContent } = require("../middleware/contentModerator");
    const modResult = await analyzeContent(text);
    if (modResult.autoReject) {
      return res.status(400).json({ message: "Reply violates community guidelines." });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (comment.replies && comment.replies.length >= 50) {
      return res.status(400).json({ message: "Reply limit reached" });
    }

    const isPostAuthor = post.author.toString() === req.user._id.toString();

    comment.replies.push({
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      text,
      isPostAuthor,
      replyingTo: replyingTo || null,
      createdAt: new Date(),
    });

    // increment commentCount
    post.commentCount = (post.commentCount || 0) + 1;

    await post.save({ validateBeforeSave: false });

    const newReply = comment.replies[comment.replies.length - 1];

    const payload = {
      postId: req.params.id,
      commentId: req.params.commentId,
      reply: newReply.toObject(),
      totalComments: post.commentCount,
    };

    if (req.io) {
      req.io.to(`post:${req.params.id}`).emit("reply_added", payload);
    }

    // Notify comment author
    try {
      if (comment.author.toString() !== req.user._id.toString()) {
        const Notification = require("../models/Notification");
        await Notification.create({
          recipient: comment.author,
          sender: req.user._id,
          senderPseudonym: req.user.pseudonym,
          type: "reply",
          post: post._id,
          postPreview: post.content?.substring(0, 60),
          commentText: text.substring(0, 80),
        });

        const { sendPushNotification } = require("../utils/sendPush");
        await sendPushNotification(comment.author, {
          title: `${req.user.pseudonym} replied to your comment`,
          body: text.substring(0, 80),
          data: { screen: "Feed", postId: post._id.toString() },
        });
      }
    } catch (e) {
      console.log("Reply notification error:", e.message);
    }

    return res.status(201).json({
      message: "Reply added 💜",
      reply: newReply,
      commentCount: post.commentCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/posts/:id
exports.editPost = async (req, res) => {
  try {
    const { content, mood } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.author.toString()!== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed to edit this post" });
    }
    if (content) {
      const modResult = await analyzeContent(content);
      if (modResult.autoReject) {
        return res.status(400).json({ message: "Edited content violates community guidelines." });
      }
      post.content = content;
      // Re-extract hashtags on edit
      const extracted = (content.match(/#\w+/g) || [])
       .map((t) => t.toLowerCase())
       .filter((t) => t.length <= 32)
       .slice(0, 5);
      post.hashtags = [...new Set(extracted)];
    }
    if (mood) post.mood = mood;
    await post.save({ validateBeforeSave: false });
    return res.json({ message: "Post updated 💜", post });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route DELETE /api/posts/:id
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.author.toString()!== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed to delete this post" });
    }
    await post.deleteOne();
    return res.json({ message: "Post deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/posts/:id/report
exports.reportPost = async (req, res) => {
  try {
    const { reason, details } = req.body;
    const validReasons = ["harmful_content", "spam", "inappropriate", "bullying", "misinformation", "other"];
    if (!reason ||!validReasons.includes(reason)) {
      return res.status(400).json({ message: "Valid reason is required" });
    }
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const existing = await Report.findOne({ post: req.params.id, reportedBy: req.user._id });
    if (existing) return res.status(400).json({ message: "You have already reported this post" });
    const modResult = await analyzeContent(post.content);
    const report = await Report.create({
      post: req.params.id,
      reportedBy: req.user._id,
      reason,
      details: details || "",
      autoFlagged: modResult.flags.length > 0,
      flagType: modResult.flags[0]?.type || null,
      postContent: post.content,
      postPseudonym: post.pseudonym,
    });
    const reportCount = await Report.countDocuments({ post: req.params.id, status: "pending" });
    if (reportCount >= 3) {
      await Post.findByIdAndUpdate(req.params.id, { flagged: true, flagType: "community_reports" });
    }
    return res.status(201).json({ message: "Thank you for keeping HushCircle safe 💜", reportId: report._id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/posts/:id/save
exports.savePost = async (req, res) => {
  try {
    const User = require("../models/User");
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const postId = req.params.id;
    const alreadySaved = user.savedPosts.includes(postId);
    if (alreadySaved) user.savedPosts.pull(postId);
    else user.savedPosts.push(postId);
    await user.save({ validateBeforeSave: false });
    return res.json({ message: alreadySaved? "Post removed from saved" : "Post saved 💜", saved:!alreadySaved });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.searchPosts = async (req, res) => {
  try {
    const { q, mood, author } = req.query;
    const userId = req.user._id.toString(); // <-- add this

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: "Search query must be at least 2 characters" });
    }

    const query = {
      $or: [
        { content: { $regex: q.trim(), $options: "i" } },
        { hashtags: { $regex: q.trim(), $options: "i" } },
        { pseudonym: { $regex: q.trim(), $options: "i" } },
      ],
    };

    if (mood && mood !== "all") {
      query.mood = mood;
    }

    if (author) {
      query.pseudonym = { $regex: `^${author.trim()}$`, $options: "i" };
      delete query.$or;
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(30)
      .select("-author");

    const postsWithReactions = posts.map((post) => {
      const obj = post.toObject();
      const reactions = Array.isArray(obj.reactions) ? obj.reactions : [];
      
      const reactionCounts = {};
      reactions.forEach((r) => {
        if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
      });

      const userReactionObj = reactions.find(r => r.user && r.user.toString() === userId); // <-- add this

      return {
        ...obj,
        reactions,
        reactionCounts,
        totalReactions: reactions.length,
        authorId: obj.author?.toString(),
        userReaction: userReactionObj?.type || null, // <-- add this
        hasReacted:!!userReactionObj, // <-- add this
      };
    });

    return res.json({ posts: postsWithReactions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


// @route PUT /api/posts/:id/comments/:commentId
exports.editComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Text is required" });

    const { analyzeContent } = require("../middleware/contentModerator");
    const mod = await analyzeContent(text);
    if (mod.autoReject) return res.status(400).json({ message: "Comment violates community guidelines." });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Only comment author can edit
    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to edit this comment" });
    }

    comment.text = text.trim();
    comment.edited = true;
    await post.save({ validateBeforeSave: false });

    // Emit real-time event
    if (req.io) {
      req.io.to(`post:${req.params.id}`).emit("comment_updated", {
        postId: req.params.id,
        commentId: req.params.commentId,
        text: comment.text,
        edited: true,
      });
    }

    return res.json({ message: "Comment updated 💜", comment });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};




// @route DELETE /api/posts/:id/comments/:commentId
exports.deleteComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const isCommentAuthor = comment.author.toString() === req.user._id.toString();
    const isPostAuthor = post.author.toString() === req.user._id.toString();

    if (!isCommentAuthor && !isPostAuthor) {
      return res.status(403).json({ message: "Not authorized to delete this comment" });
    }

    // Count: 1 for the comment + all active replies under it
    const activeReplies = comment.replies.filter((r) => !r.deleted).length;
    const countToRemove = 1 + activeReplies;

    // Soft delete comment AND all its replies
    comment.text = "This comment was deleted.";
    comment.deleted = true;
    comment.deletedAt = new Date();

    // Soft delete all replies under this comment too
    for (const reply of comment.replies) {
      if (!reply.deleted) {
        reply.text = "This reply was deleted.";
        reply.deleted = true;
        reply.deletedAt = new Date();
      }
    }

    post.commentCount = Math.max(0, (post.commentCount || 0) - countToRemove);

    await post.save({ validateBeforeSave: false });

    if (req.io) {
      req.io.to(`post:${req.params.id}`).emit("comment_deleted", {
        postId: req.params.id,
        commentId: req.params.commentId,
        commentCount: post.commentCount,
      });
    }

    return res.json({
      message: "Comment deleted 💜",
      commentCount: post.commentCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


// @route PUT /api/posts/:id/comments/:commentId/replies/:replyId
exports.editReply = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Text is required" });

    const { analyzeContent } = require("../middleware/contentModerator");
    const mod = await analyzeContent(text);
    if (mod.autoReject) return res.status(400).json({ message: "Reply violates community guidelines." });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    if (reply.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to edit this reply" });
    }

    reply.text = text.trim();
    reply.edited = true;
    await post.save({ validateBeforeSave: false });

    if (req.io) {
      req.io.to(`post:${req.params.id}`).emit("reply_updated", {
        postId: req.params.id,
        commentId: req.params.commentId,
        replyId: req.params.replyId,
        text: reply.text,
        edited: true,
      });
    }

    return res.json({ message: "Reply updated 💜", reply });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};




// @route DELETE /api/posts/:id/comments/:commentId/replies/:replyId
exports.deleteReply = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    const isReplyAuthor = reply.author.toString() === req.user._id.toString();
    const isPostAuthor = post.author.toString() === req.user._id.toString();

    if (!isReplyAuthor && !isPostAuthor) {
      return res.status(403).json({ message: "Not authorized to delete this reply" });
    }

    reply.text = "This reply was deleted.";
    reply.deleted = true;
    reply.deletedAt = new Date();

    post.commentCount = Math.max(0, (post.commentCount || 0) - 1);

    await post.save({ validateBeforeSave: false });

    if (req.io) {
      req.io.to(`post:${req.params.id}`).emit("reply_deleted", {
        postId: req.params.id,
        commentId: req.params.commentId,
        replyId: req.params.replyId,
        commentCount: post.commentCount,
      });
    }

    return res.json({
      message: "Reply deleted 💜",
      commentCount: post.commentCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
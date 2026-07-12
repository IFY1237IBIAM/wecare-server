const Post = require("../models/Post");
const Report = require("../models/Report");
const Repost = require("../models/Repost");
const { analyzeContent } = require("../middleware/contentModerator");
const Notification = require("../models/Notification");
const { sendPushNotification } = require("../utils/sendPush");

// @route POST /api/posts
exports.createPost = async (req, res) => {
  try {
    const { content, mood } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content is required" });
    }

    const modResult = await analyzeContent(content);

    if (modResult.autoReject) {
      return res.status(400).json({
        message:
          "Your post could not be shared as it may contain harmful content. Please review our community guidelines.",
        flagType: modResult.flags[0]?.type,
      });
    }

    const extracted = (content.match(/#\w+/g) || [])
      .map((t) => t.toLowerCase())
      .filter((t) => t.length <= 32)
      .slice(0, 5);
    const hashtags = [...new Set(extracted)];

    const post = await Post.create({
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      content: content.trim(),
      mood: mood || "sadness",
      hashtags,
      flagged: modResult.flags.length > 0,
      flagType: modResult.flags[0]?.type || null,
      // allowReposts defaults to true; users can disable via settings
      allowReposts: true,
    });

    const obj = post.toObject();
    const reactions = Array.isArray(obj.reactions) ? obj.reactions : [];
    const reactionCounts = {};
    reactions.forEach((r) => {
      if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
    });

    const response = {
      message: "Post shared 💜",
      post: { ...obj, reactions, reactionCounts, totalReactions: reactions.length },
      crisisDetected: modResult.crisisDetected,
      autoFlagged: modResult.flags.length > 0,
    };

    if (modResult.crisisDetected) {
      response.crisisMessage =
        "We noticed your post may be expressing thoughts of self-harm. You are not alone 💜";
      response.crisisResources = [
        {
          name: "International Association for Suicide Prevention",
          url: "https://www.iasp.info/resources/Crisis_Centres/",
        },
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
exports.getFeed = async (req, res) => {
  try {
    const User  = require("../models/User");
    const limit  = parseInt(req.query.limit) || 15;
    const lastId  = req.query.lastId;
    const sinceId = req.query.sinceId;
    const userId  = req.user._id;
 
    const user = await User.findById(userId).select("savedPosts");
    const savedSet = new Set(user.savedPosts.map((id) => id.toString()));
 
    const userReposts = await Repost.find({ user: userId })
      .select("originalPost")
      .lean();
    const repostedSet = new Set(
      userReposts.map((r) => r.originalPost.toString())
    );
 
    const query = { author: { $ne: userId } };
    if (lastId)   query._id = { $lt: lastId };
    else if (sinceId) query._id = { $gt: sinceId };
 
    // ── STRIP COMMENTS from the feed query ─────────────────────────────────
    // Select everything EXCEPT the comments array.
    // commentCount is kept so the PostCard can show "42 comments" button.
    // The actual comments are fetched lazily when the user taps the button.
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-comments")    // ← THE KEY CHANGE
      .lean();
 
    const repostQuery = { user: { $ne: userId } };
    if (lastId)   repostQuery._id = { $lt: lastId };
    else if (sinceId) repostQuery._id = { $gt: sinceId };
 
    const reposts = await Repost.find(repostQuery)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({
        path:   "originalPost",
        model:  "Post",
        select: "-comments",  // ← strip comments from reposts too
      })
      .lean();
 
    const postsWithReactions = posts.map((post) => {
      const reactions = Array.isArray(post.reactions) ? post.reactions : [];
      const reactionCounts = {};
      reactions.forEach((r) => {
        if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
      });
      const userReactionObj = reactions.find(
        (r) => r.user && r.user.toString() === userId.toString()
      );
      return {
        ...post,
        reactions,
        reactionCounts,
        totalReactions:  reactions.length,
        authorId:        post.author?.toString(),
        userReaction:    userReactionObj?.type || null,
        hasReacted:      !!userReactionObj,
        isSaved:         savedSet.has(post._id.toString()),
        isReposted:      repostedSet.has(post._id.toString()),
        isRepostItem:    false,
        allowReposts:    post.allowReposts !== false,
        comments:        [],   // ← always empty in feed, loaded lazily on tap
      };
    });
 
    const repostItems = reposts
      .filter((r) => r.originalPost && r.originalPost.allowReposts !== false)
      .map((r) => {
        const original = r.originalPost;
        const reactions = Array.isArray(original.reactions)
          ? original.reactions
          : [];
        const reactionCounts = {};
        reactions.forEach((rx) => {
          if (rx.type) reactionCounts[rx.type] = (reactionCounts[rx.type] || 0) + 1;
        });
        const userReactionObj = reactions.find(
          (rx) => rx.user && rx.user.toString() === userId.toString()
        );
        return {
          _id:               r._id.toString(),
          isRepostItem:      true,
          repostId:          r._id.toString(),
          reposterPseudonym: r.pseudonym,
          repostThought:     r.thought || "",
          repostCreatedAt:   r.createdAt,
          repostComments:    [],   // ← empty in feed, loaded lazily
          repostCommentCount: r.repostCommentCount || 0,
          originalPost: {
            ...original,
            reactions,
            reactionCounts,
            totalReactions:  reactions.length,
            authorId:        original.author?.toString(),
            userReaction:    userReactionObj?.type || null,
            hasReacted:      !!userReactionObj,
            isSaved:         savedSet.has(original._id.toString()),
            isReposted:      repostedSet.has(original._id.toString()),
            allowReposts:    original.allowReposts !== false,
            comments:        [],  // ← empty in feed
          },
        };
      });
 
    const allItems = [...postsWithReactions, ...repostItems]
      .sort((a, b) => {
        const dateA = new Date(a.isRepostItem ? a.repostCreatedAt : a.createdAt);
        const dateB = new Date(b.isRepostItem ? b.repostCreatedAt : b.createdAt);
        return dateB - dateA;
      })
      .slice(0, limit);
 
    // NOTE: The online-status enrichment block for comment authors has been
    // removed since we no longer send comments in the feed. This eliminates
    // an additional User.find() query per feed request, further improving speed.
 
    return res.json({ posts: allItems });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/posts/:id/react
exports.reactToPost = async (req, res) => {
  try {
    const { type } = req.body;
    const validTypes = ["care", "heart", "hug", "strong", "cry", "hope"];

    if (!type || !validTypes.includes(type)) {
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
    const existingIndex = post.reactions.findIndex(
      (r) => r.user && r.user.toString() === userId
    );

    if (existingIndex !== -1) {
      if (post.reactions[existingIndex].type === type) {
        post.reactions.splice(existingIndex, 1);
      } else {
        post.reactions[existingIndex].type = type;
      }
    } else {
      post.reactions.push({ user: req.user._id, type });
    }

    await post.save({ validateBeforeSave: false });

    // Notification always goes to original post author
    try {
      const freshPost = await Post.findById(req.params.id).select(
        "author pseudonym content"
      );
      if (
        freshPost &&
        freshPost.author.toString() !== req.user._id.toString()
      ) {
        await Notification.deleteOne({
          recipient: freshPost.author,
          sender: req.user._id,
          post: req.params.id,
          type: "reaction",
        });

        const newReaction = post.reactions.find(
          (r) => r.user && r.user.toString() === userId
        );
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

          await sendPushNotification(freshPost.author, {
            title: `${req.user.pseudonym} reacted to your post`,
            body: newReaction.type,
            data: {
              screen: "Feed",
              postId: req.params.id.toString(),
              type: "reaction",
            },
          });
        }
      }
    } catch (e) {
      console.log("Notification error:", e.message);
    }

    const reactionCounts = {};
    post.reactions.forEach((r) => {
      if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
    });

    const userReaction = post.reactions.find(
      (r) => r.user && r.user.toString() === userId
    );

    const payload = {
      postId: req.params.id,
      reactionCounts,
      totalReactions: post.reactions.length,
      userReaction: userReaction?.type || null,
    };

    if (req.io) {
      req.io.to(`post:${req.params.id}`).emit("reaction_updated", payload);
    }

    return res.json({ message: "Reaction updated 💜", ...payload });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/posts/:id/comments
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Comment text is required" });

    const modResult = await analyzeContent(text);
    if (modResult.autoReject) {
      return res
        .status(400)
        .json({ message: "Comment violates community guidelines." });
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
        $inc: { commentCount: 1 },
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

    try {
      if (post.author.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: post.author,
          sender: req.user._id,
          senderPseudonym: req.user.pseudonym,
          type: "comment",
          post: post._id,
          postPreview: post.content?.substring(0, 60),
          commentText: text.substring(0, 100),
        });

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

    const modResult = await analyzeContent(text);
    if (modResult.autoReject) {
      return res
        .status(400)
        .json({ message: "Reply violates community guidelines." });
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

    try {
      if (comment.author.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: comment.author,
          sender: req.user._id,
          senderPseudonym: req.user.pseudonym,
          type: "reply",
          post: post._id,
          postPreview: post.content?.substring(0, 60),
          commentText: text.substring(0, 80),
        });

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
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed to edit this post" });
    }
    if (content) {
      const modResult = await analyzeContent(content);
      if (modResult.autoReject) {
        return res
          .status(400)
          .json({ message: "Edited content violates community guidelines." });
      }
      post.content = content;
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
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed to delete this post" });
    }
    await post.deleteOne();
    // Cascade-delete all reposts of this post
    await Repost.deleteMany({ originalPost: req.params.id });
    return res.json({ message: "Post deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/posts/:id/report
exports.reportPost = async (req, res) => {
  try {
    const { reason, details } = req.body;
    const validReasons = [
      "harmful_content",
      "spam",
      "inappropriate",
      "bullying",
      "misinformation",
      "other",
    ];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({ message: "Valid reason is required" });
    }
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const existing = await Report.findOne({
      post: req.params.id,
      reportedBy: req.user._id,
    });
    if (existing)
      return res
        .status(400)
        .json({ message: "You have already reported this post" });
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
    const reportCount = await Report.countDocuments({
      post: req.params.id,
      status: "pending",
    });
    if (reportCount >= 3) {
      await Post.findByIdAndUpdate(req.params.id, {
        flagged: true,
        flagType: "community_reports",
      });
    }
    return res.status(201).json({
      message: "Thank you for keeping HushCircle safe 💜",
      reportId: report._id,
    });
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
    return res.json({
      message: alreadySaved ? "Post removed from saved" : "Post saved 💜",
      saved: !alreadySaved,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/posts/search
exports.searchPosts = async (req, res) => {
  try {
    const { q, mood, author } = req.query;
    const userId = req.user._id.toString();

    if (!q || q.trim().length < 2) {
      return res
        .status(400)
        .json({ message: "Search query must be at least 2 characters" });
    }

    const query = {
      $or: [
        { content: { $regex: q.trim(), $options: "i" } },
        { hashtags: { $regex: q.trim(), $options: "i" } },
        { pseudonym: { $regex: q.trim(), $options: "i" } },
      ],
    };

    if (mood && mood !== "all") query.mood = mood;

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
      const userReactionObj = reactions.find(
        (r) => r.user && r.user.toString() === userId
      );
      return {
        ...obj,
        reactions,
        reactionCounts,
        totalReactions: reactions.length,
        authorId: obj.author?.toString(),
        userReaction: userReactionObj?.type || null,
        hasReacted: !!userReactionObj,
        allowReposts: obj.allowReposts !== false,
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

    const mod = await analyzeContent(text);
    if (mod.autoReject)
      return res
        .status(400)
        .json({ message: "Comment violates community guidelines." });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (comment.author.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to edit this comment" });
    }

    comment.text = text.trim();
    comment.edited = true;
    await post.save({ validateBeforeSave: false });

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

    const isCommentAuthor =
      comment.author.toString() === req.user._id.toString();
    const isPostAuthor = post.author.toString() === req.user._id.toString();

    if (!isCommentAuthor && !isPostAuthor) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this comment" });
    }

    const activeReplies = comment.replies.filter((r) => !r.deleted).length;
    const countToRemove = 1 + activeReplies;

    comment.text = "This comment was deleted.";
    comment.deleted = true;
    comment.deletedAt = new Date();

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

    return res.json({ message: "Comment deleted 💜", commentCount: post.commentCount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/posts/:id/comments/:commentId/replies/:replyId
exports.editReply = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: "Text is required" });

    const mod = await analyzeContent(text);
    if (mod.autoReject)
      return res
        .status(400)
        .json({ message: "Reply violates community guidelines." });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const reply = comment.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    if (reply.author.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to edit this reply" });
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
      return res
        .status(403)
        .json({ message: "Not authorized to delete this reply" });
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

    return res.json({ message: "Reply deleted 💜", commentCount: post.commentCount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REPOST CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

// @route POST /api/posts/:id/repost
// Body: { thought?: string, confirmed: true }
// confirmed: true is required — the frontend must show a confirmation overlay first.
exports.createRepost = async (req, res) => {
  try {
    const { thought, confirmed } = req.body;
    const postId = req.params.id;

    // Require explicit confirmation from the frontend overlay
    if (!confirmed) {
      return res.status(400).json({
        message: "Please confirm before reposting.",
        requiresConfirmation: true,
      });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Privacy guard: creator disabled reposts
    if (post.allowReposts === false) {
      return res.status(403).json({
        message: "The creator has disabled reposts for this story.",
      });
    }

    // No self-repost
    

    // No repost-of-repost: if this post's _id is actually a Repost's originalPost
    // we allow it (it IS the original). But we block if the user is trying to repost
    // something that was itself created as a repost of another original.
    // Since we only store original Posts in originalPost field, and we always
    // link to the root Post, this is enforced by always redirecting reposts to
    // the original. If someone taps "repost" on a repost card in the feed, the
    // frontend passes originalPost._id, so this is already handled on the client.
    // As an extra server guard, check if this postId is someone else's repost target
    // that originated from a different post — not applicable here since each Repost
    // points at the original Post document. No further action needed.

    // Duplicate guard
    const existing = await Repost.findOne({
      user: req.user._id,
      originalPost: postId,
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "You have already reposted this" });
    }

    const repost = await Repost.create({
      user: req.user._id,
      originalPost: postId,
      originalAuthor: post.author,
      thought: thought?.trim() || "",
      pseudonym: req.user.pseudonym,
    });

    await Post.findByIdAndUpdate(postId, { $inc: { repostCount: 1 } });

    // Only notify if someone else reposted (not the author reposting their own)
    if (post.author.toString() !== req.user._id.toString()) {
      try {
        await Notification.create({
          recipient: post.author,
          sender: req.user._id,
          senderPseudonym: req.user.pseudonym,
          type: "repost",
          post: postId,
          postPreview: post.content?.substring(0, 60),
          repostThought: thought?.trim() || "",
        });

        await sendPushNotification(post.author, {
          title: `${req.user.pseudonym} reposted your story`,
          body: thought?.trim()
            ? `"${thought.trim().substring(0, 60)}"`
            : "Your story is being shared 💜",
          data: {
            screen: "Feed",
            postId: postId.toString(),
            type: "repost",
          },
        });
      } catch (e) {
        console.log("Repost notification error:", e.message);
      }
    }

    return res.status(201).json({
      message: "Reposted 💜",
      repost,
      repostCount: post.repostCount + 1,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "You have already reposted this" });
    }
    return res.status(500).json({ message: error.message });
  }
};
// @route DELETE /api/posts/:id/repost
exports.deleteRepost = async (req, res) => {
  try {
    const postId = req.params.id;

    const repost = await Repost.findOne({
      user: req.user._id,
      originalPost: postId,
    });
    if (!repost) return res.status(404).json({ message: "Repost not found" });

    await repost.deleteOne();
    await Post.findByIdAndUpdate(postId, { $inc: { repostCount: -1 } });

    const updated = await Post.findById(postId).select("repostCount");

    return res.json({
      message: "Repost removed",
      repostCount: Math.max(0, updated?.repostCount || 0),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/posts/:id/reposts
exports.getReposts = async (req, res) => {
  try {
    const reposts = await Repost.find({ originalPost: req.params.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return res.json({ reposts });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REPOST SECONDARY COMMENT STREAM
// Comments on a resharer's repost — go to the resharer, not the original author.
// ─────────────────────────────────────────────────────────────────────────────

// @route POST /api/reposts/:repostId/comments
exports.addRepostComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim())
      return res.status(400).json({ message: "Comment text is required" });

    const mod = await analyzeContent(text);
    if (mod.autoReject)
      return res
        .status(400)
        .json({ message: "Comment violates community guidelines." });

    const repost = await Repost.findById(req.params.repostId);
    if (!repost) return res.status(404).json({ message: "Repost not found" });

    repost.repostComments.push({
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      text: text.trim(),
    });
    repost.repostCommentCount = (repost.repostCommentCount || 0) + 1;
    await repost.save({ validateBeforeSave: false });

    const newComment = repost.repostComments[repost.repostComments.length - 1];

    // Notify the resharer (not the original author)
    try {
      if (repost.user.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: repost.user,
          sender: req.user._id,
          senderPseudonym: req.user.pseudonym,
          type: "repost_comment",
          post: repost.originalPost,
          commentText: text.substring(0, 100),
        });

        await sendPushNotification(repost.user, {
          title: `${req.user.pseudonym} commented on your repost`,
          body: text.substring(0, 80),
          data: {
            screen: "Feed",
            repostId: repost._id.toString(),
            type: "repost_comment",
          },
        });
      }
    } catch (e) {
      console.log("Repost comment notification error:", e.message);
    }

    if (req.io) {
      req.io
        .to(`repost:${req.params.repostId}`)
        .emit("repost_comment_added", {
          repostId: req.params.repostId,
          comment: newComment.toObject(),
          repostCommentCount: repost.repostCommentCount,
        });
    }

    return res.status(201).json({
      message: "Comment added 💜",
      comment: newComment,
      repostCommentCount: repost.repostCommentCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/reposts/:repostId/comments/:commentId
exports.editRepostComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim())
      return res.status(400).json({ message: "Text is required" });

    const mod = await analyzeContent(text);
    if (mod.autoReject)
      return res.status(400).json({ message: "Comment violates community guidelines." });

    const repost = await Repost.findById(req.params.repostId);
    if (!repost) return res.status(404).json({ message: "Repost not found" });

    const comment = repost.repostComments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to edit this comment" });
    }

    comment.text = text.trim();
    comment.edited = true;
    await repost.save({ validateBeforeSave: false });

    if (req.io) {
      req.io.to(`repost:${req.params.repostId}`).emit("repost_comment_updated", {
        repostId: req.params.repostId,
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

// @route DELETE /api/reposts/:repostId/comments/:commentId
exports.deleteRepostComment = async (req, res) => {
  try {
    const repost = await Repost.findById(req.params.repostId);
    if (!repost) return res.status(404).json({ message: "Repost not found" });

    const comment = repost.repostComments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const isCommentAuthor =
      comment.author.toString() === req.user._id.toString();
    const isRepostAuthor = repost.user.toString() === req.user._id.toString();

    if (!isCommentAuthor && !isRepostAuthor) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this comment" });
    }

    comment.text = "This comment was deleted.";
    comment.deleted = true;
    comment.deletedAt = new Date();

    repost.repostCommentCount = Math.max(
      0,
      (repost.repostCommentCount || 0) - 1
    );
    await repost.save({ validateBeforeSave: false });

    return res.json({
      message: "Comment deleted 💜",
      repostCommentCount: repost.repostCommentCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PATCH /api/posts/:id/allow-reposts
// Body: { allowReposts: boolean }
// Lets a post author toggle whether others can repost their content.
exports.toggleAllowReposts = async (req, res) => {
  try {
    const { allowReposts } = req.body;
    if (typeof allowReposts !== "boolean") {
      return res.status(400).json({ message: "allowReposts must be a boolean" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    post.allowReposts = allowReposts;
    await post.save({ validateBeforeSave: false });

    return res.json({
      message: allowReposts
        ? "Reposts enabled for this post 💜"
        : "Reposts disabled for this post",
      allowReposts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


exports.getPostsByHashtag = async (req, res) => {
  try {
    const tag = req.params.tag?.toLowerCase().replace(/^#/, "");
    if (!tag) return res.status(400).json({ message: "Hashtag is required" });

    const limit  = parseInt(req.query.limit)  || 15;
    const lastId = req.query.lastId;

    const query = {
      hashtags: tag,
      flagged:  { $ne: true },
    };

    if (lastId) query._id = { $lt: lastId };

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const postsWithReactions = posts.map((post) => {
      const reactions     = Array.isArray(post.reactions) ? post.reactions : [];
      const reactionCounts = {};
      reactions.forEach((r) => {
        if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
      });
      return {
        ...post,
        reactions,
        reactionCounts,
        totalReactions: reactions.length,
        authorId:       post.author?.toString(),
        comments:       [],
        commentCount:   post.comments?.length || 0,
      };
    });

    return res.json({
      posts: postsWithReactions,
      hasMore: posts.length === limit,
      tag,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


// @route GET /api/posts/:id/comments
exports.getPostComments = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .select("comments commentCount")
      .lean();
    if (!post) return res.status(404).json({ message: "Post not found" });

    const User = require("../models/User");
    const pseudonyms = new Set();
    post.comments?.forEach((c) => {
      if (c.pseudonym) pseudonyms.add(c.pseudonym);
      (c.replies || []).forEach((r) => { if (r.pseudonym) pseudonyms.add(r.pseudonym); });
    });

    let authorMap = {};
    if (pseudonyms.size > 0) {
      const authors = await User.find({ pseudonym: { $in: Array.from(pseudonyms) } })
        .select("pseudonym showOnlineStatus isOnline lastSeen")
        .lean();
      authors.forEach((a) => { authorMap[a.pseudonym] = a; });
    }

    const enrich = (c) => ({
      ...c,
      showOnlineStatus: authorMap[c.pseudonym]?.showOnlineStatus || false,
      isOnline:         authorMap[c.pseudonym]?.isOnline || false,
      lastSeen:         authorMap[c.pseudonym]?.lastSeen || null,
    });

    const comments = (post.comments || []).map((c) => ({
      ...enrich(c),
      replies: (c.replies || []).map(enrich),
    }));

    return res.json({ comments, commentCount: post.commentCount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
const Post = require("../models/Post");
const Report = require("../models/Report");
const { analyzeContent } = require("../middleware/contentModerator");
const Notification = require("../models/Notification");

// @route  POST /api/posts
exports.createPost = async (req, res) => {
  try {
    const { content, mood } = req.body;

    if (!content) {
      return res.status(400).json({
        message: "Content is required",
      });
    }

    const modResult = await analyzeContent(content);

    if (modResult.autoReject) {
      return res.status(400).json({
        message:
          "Your post could not be shared as it may contain harmful content. Please review our community guidelines.",
        flagType: modResult.flags[0]?.type,
      });
    }

    const post = await Post.create({
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      content,
      mood: mood || "sadness",
      flagged:
        modResult.crisisDetected ||
        modResult.profanityDetected,
      flagType: modResult.flags[0]?.type || null,
    });

    const response = {
      message: "Post created 💜",
      post,
    };

    if (modResult.crisisDetected) {
      response.crisisDetected = true;

      response.crisisMessage =
        "We noticed your post may be expressing thoughts of self-harm. You are not alone 💜";

      response.crisisResources = [
        {
          name: "International Association for Suicide Prevention",
          url: "https://www.iasp.info/resources/Crisis_Centres/",
        },
        {
          name: "Crisis Text Line",
          info: "Text HOME to 741741 (US)",
        },
        {
          name: "Befrienders Worldwide",
          url: "https://www.befrienders.org",
        },
      ];
    }

    return res.status(201).json(response);
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

// @route  GET /api/posts
exports.getFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const lastId = req.query.lastId;

    const query = lastId
      ? { _id: { $lt: lastId } }
      : {};

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-author");

    const postsWithReactions = posts.map((post) => {
      const obj = post.toObject();

      const reactions = Array.isArray(obj.reactions)
        ? obj.reactions
        : [];

      const reactionCounts = {};

      reactions.forEach((r) => {
        if (r.type) {
          reactionCounts[r.type] =
            (reactionCounts[r.type] || 0) + 1;
        }
      });

      return {
        ...obj,
        reactions,
        reactionCounts,
        totalReactions: reactions.length,
      };
    });

    return res.json({
      posts: postsWithReactions,
      count: posts.length,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

// @route  POST /api/posts/:id/react
exports.reactToPost = async (req, res) => {
  try {
    const { type } = req.body;

    const validTypes = [
      "care",
      "heart",
      "hug",
      "strong",
      "cry",
      "hope",
    ];

    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        message: "Invalid reaction type",
      });
    }

    await Post.updateOne(
      {
        _id: req.params.id,
        $nor: [{ reactions: { $type: "array" } }],
      },
      {
        $set: { reactions: [] },
      }
    );

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    if (!Array.isArray(post.reactions)) {
      post.reactions = [];
    }

    const userId = req.user._id.toString();

    const existingIndex = post.reactions.findIndex(
      (r) =>
        r.user &&
        r.user.toString() === userId
    );

    if (existingIndex !== -1) {
      if (post.reactions[existingIndex].type === type) {
        post.reactions.splice(existingIndex, 1);
      } else {
        post.reactions[existingIndex].type = type;
      }
    } else {
      post.reactions.push({
        user: req.user._id,
        type,
      });
    }

    await post.save({
      validateBeforeSave: false,
    });

    // Create notification for post author (not for own posts)
    try {
      const freshPost = await Post.findById(
        req.params.id
      ).select("author pseudonym content");

      if (
        freshPost &&
        freshPost.author.toString() !==
          req.user._id.toString()
      ) {
        // Remove old reaction notification
        await Notification.deleteOne({
          recipient: freshPost.author,
          sender: req.user._id,
          post: req.params.id,
          type: "reaction",
        });

        // Only create if user reacted
        if (
          existingIndex === -1 ||
          post.reactions.find(
            (r) =>
              r.user &&
              r.user.toString() === userId
          )
        ) {
          const newReaction = post.reactions.find(
            (r) =>
              r.user &&
              r.user.toString() === userId
          );

          if (newReaction) {
            await Notification.create({
              recipient: freshPost.author,
              sender: req.user._id,
              senderPseudonym:
                req.user.pseudonym,
              type: "reaction",
              post: req.params.id,
              postPreview:
                freshPost.content?.substring(
                  0,
                  60
                ),
              reactionType: newReaction.type,
            });
          }
        }
      }
    } catch (e) {
      console.log(
        "Notification error:",
        e.message
      );
    }

    const reactionCounts = {};

    post.reactions.forEach((r) => {
      if (r.type) {
        reactionCounts[r.type] =
          (reactionCounts[r.type] || 0) + 1;
      }
    });

    const userReaction = post.reactions.find(
      (r) =>
        r.user &&
        r.user.toString() === userId
    );

    return res.json({
      message: "Reaction updated 💜",
      reactionCounts,
      totalReactions: post.reactions.length,
      userReaction: userReaction?.type || null,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

// @route  POST /api/posts/:id/comments
// @route  POST /api/posts/:id/comments
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const modResult = await analyzeContent(text);

    if (modResult.autoReject) {
      return res.status(400).json({
        message: "Your comment contains content that violates our community guidelines.",
      });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.comments.length >= 50) {
      return res.status(400).json({ message: "Comment limit reached" });
    }

    const updated = await Post.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          comments: {
            author: req.user._id,
            pseudonym: req.user.pseudonym,
            text,
            parentId: null, // <-- add this
            isPostAuthor: post.author.toString() === req.user._id.toString(),
            createdAt: new Date(),
          },
        },
      },
      { new: true, runValidators: false }
    );

    const newComment = updated.comments[updated.comments.length - 1];

    // Create notification for post author
    try {
      const freshPost = await Post.findById(req.params.id).select("author content");

      if (freshPost && freshPost.author.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: freshPost.author,
          sender: req.user._id,
          senderPseudonym: req.user.pseudonym,
          type: "comment",
          post: req.params.id,
          postPreview: freshPost.content?.substring(0, 60),
          commentText: text.substring(0, 100),
        });
      }
    } catch (e) {
      console.log("Notification error:", e.message);
    }

    return res.status(201).json({
      message: "Comment added 💜",
      comment: newComment,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route  PUT /api/posts/:id
exports.editPost = async (req, res) => {
  try {
    const { content, mood } = req.body;

    const post = await Post.findById(
      req.params.id
    );

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    if (
      post.author.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "Not allowed to edit this post",
      });
    }

    if (content) {
      const modResult =
        await analyzeContent(content);

      if (modResult.autoReject) {
        return res.status(400).json({
          message:
            "Edited content violates community guidelines.",
        });
      }

      post.content = content;
    }

    if (mood) {
      post.mood = mood;
    }

    await post.save({
      validateBeforeSave: false,
    });

    return res.json({
      message: "Post updated 💜",
      post,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

// @route  DELETE /api/posts/:id
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(
      req.params.id
    );

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    if (
      post.author.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        message:
          "Not allowed to delete this post",
      });
    }

    await post.deleteOne();

    return res.json({
      message: "Post deleted",
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

// @route  POST /api/posts/:id/report
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

    if (
      !reason ||
      !validReasons.includes(reason)
    ) {
      return res.status(400).json({
        message: "Valid reason is required",
      });
    }

    const post = await Post.findById(
      req.params.id
    );

    if (!post) {
      return res.status(404).json({
        message: "Post not found",
      });
    }

    const existing = await Report.findOne({
      post: req.params.id,
      reportedBy: req.user._id,
    });

    if (existing) {
      return res.status(400).json({
        message:
          "You have already reported this post",
      });
    }

    const modResult = await analyzeContent(
      post.content
    );

    const report = await Report.create({
      post: req.params.id,
      reportedBy: req.user._id,
      reason,
      details: details || "",
      autoFlagged:
        modResult.flags.length > 0,
      flagType:
        modResult.flags[0]?.type || null,
      postContent: post.content,
      postPseudonym: post.pseudonym,
    });

    const reportCount =
      await Report.countDocuments({
        post: req.params.id,
        status: "pending",
      });

    if (reportCount >= 3) {
      await Post.findByIdAndUpdate(
        req.params.id,
        {
          flagged: true,
          flagType: "community_reports",
        }
      );
    }

    return res.status(201).json({
      message:
        "Thank you for keeping WeCare safe 💜",
      reportId: report._id,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
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

    if (alreadySaved) {
      user.savedPosts.pull(postId);
    } else {
      user.savedPosts.push(postId);
    }

    await user.save({ validateBeforeSave: false });

    return res.json({
      message: alreadySaved ? "Post removed from saved" : "Post saved 💜",
      saved: !alreadySaved,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/posts/:id/comments/:commentId/replies
// @route POST /api/posts/:id/comments/:commentId/replies
exports.addReply = async (req, res) => {
  try {
    const { text, replyingTo } = req.body;
    if (!text) return res.status(400).json({ message: "Reply text is required" });

    const modResult = await analyzeContent(text);
    if (modResult.autoReject) {
      return res.status(400).json({
        message: "Your reply contains content that violates our community guidelines.",
      });
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
      parentId: comment._id, // <-- add this
      isPostAuthor,
      replyingTo: replyingTo || null,
      createdAt: new Date(),
    });

    await post.save({ validateBeforeSave: false });

    const newReply = comment.replies[comment.replies.length - 1];

    // Notify comment author
    try {
      if (comment.author.toString() !== req.user._id.toString()) {
        const Notification = require("../models/Notification");
        
        // Use type "reply" and a different message
        await Notification.create({
          recipient: comment.author,
          sender: req.user._id,
          senderPseudonym: req.user.pseudonym,
          type: "reply", // <-- changed
          post: req.params.id,
          postPreview: post.content?.substring(0, 60),
          commentText: text.substring(0, 80),
        });
      }
    } catch (e) {
      console.log("Reply notification error:", e.message);
    }

    return res.status(201).json({ message: "Reply added 💜", reply: newReply });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/posts/search
exports.searchPosts = async (req, res) => {
  try {
    const { q, mood } = req.query;
    const query = {};

    if (mood && mood !== "all") {
      query.mood = mood;
    }

    if (q && q.trim()) {
      query.content = { $regex: q.trim(), $options: "i" };
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .select("-author");

    const postsWithReactions = posts.map((post) => {
      const obj = post.toObject();
      const reactions = Array.isArray(obj.reactions) ? obj.reactions : [];
      const reactionCounts = {};
      reactions.forEach((r) => {
        if (r.type) reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
      });
      return { ...obj, reactions, reactionCounts, totalReactions: reactions.length };
    });

    return res.json({ posts: postsWithReactions, count: postsWithReactions.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
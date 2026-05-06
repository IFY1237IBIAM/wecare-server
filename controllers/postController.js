const Post = require("../models/Post");

// @route  POST /api/posts
exports.createPost = async (req, res) => {
  try {
    const { content, mood } = req.body;
    if (!content) return res.status(400).json({ message: "Content is required" });

    const post = await Post.create({
      author: req.user._id,
      pseudonym: req.user.pseudonym,
      content,
      mood: mood || "sadness",
    });

    return res.status(201).json({ message: "Post created 💜", post });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route  GET /api/posts
exports.getFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const lastId = req.query.lastId;
    const query = lastId ? { _id: { $lt: lastId } } : {};

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-author");

    // Add reaction summary to each post
    const postsWithReactions = posts.map((post) => {
      const reactionCounts = {};
      post.reactions.forEach((r) => {
        reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
      });
      return {
        ...post.toObject(),
        reactionCounts,
        totalReactions: post.reactions.length,
      };
    });

    return res.json({ posts: postsWithReactions, count: posts.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route  POST /api/posts/:id/react
// @route  POST /api/posts/:id/react
exports.reactToPost = async (req, res) => {
  try {
    console.log("REQ USER:", req.user);
    console.log("POST ID:", req.params.id);
    console.log("REACTION TYPE:", req.body.type);

    const { type } = req.body;
    const validTypes = ["care", "heart", "hug", "strong", "cry", "hope"];

    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ message: "Invalid reaction type" });
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "User not found in request" });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    console.log("POST FOUND:", post._id);
    console.log("REACTIONS:", post.reactions);

    // Find if user already reacted
    const existingIndex = post.reactions.findIndex((r) => {
      console.log("Comparing:", r.user, "with", req.user._id);
      return r.user && r.user.toString() === req.user._id.toString();
    });

    console.log("EXISTING INDEX:", existingIndex);

    if (existingIndex !== -1) {
      const existingType = post.reactions[existingIndex].type;
      if (existingType === type) {
        post.reactions.splice(existingIndex, 1);
      } else {
        post.reactions[existingIndex].type = type;
      }
    } else {
      post.reactions.push({ user: req.user._id, type });
    }

    await post.save({ validateBeforeSave: false });

    const reactionCounts = {};
    post.reactions.forEach((r) => {
      reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1;
    });

    const userReaction = post.reactions.find(
      (r) => r.user && r.user.toString() === req.user._id.toString()
    );

    return res.json({
      message: "Reaction updated 💜",
      reactionCounts,
      totalReactions: post.reactions.length,
      userReaction: userReaction?.type || null,
    });
  } catch (error) {
    console.error("REACT ERROR FULL:", error);
    return res.status(500).json({ message: error.message });
  }
};

// @route  POST /api/posts/:id/comments
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Comment text is required" });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

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
            createdAt: new Date(),
          },
        },
      },
      { new: true, runValidators: false }
    );

    const newComment = updated.comments[updated.comments.length - 1];
    return res.status(201).json({ message: "Comment added 💜", comment: newComment });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route  DELETE /api/posts/:id
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed to delete this post" });
    }

    await post.deleteOne();
    return res.json({ message: "Post deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
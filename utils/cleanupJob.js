const mongoose = require("mongoose");

const runCleanup = async () => {
  try {
    const Post = require("../models/Post");
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const posts = await Post.find({
      $or: [
        { "comments.deleted": true },
        { "comments.replies.deleted": true },
      ],
    });

    let totalCleaned = 0;

    for (const post of posts) {
      let modified = false;

      // Hard delete comments that:
      // - are soft deleted
      // - have no active replies
      // - were deleted more than 30 days ago
      post.comments = post.comments.filter((comment) => {
        const activeReplies = (comment.replies || []).filter((r) => !r.deleted);
        const shouldKeep =
          !comment.deleted ||
          activeReplies.length > 0 ||
          !comment.deletedAt ||
          comment.deletedAt > thirtyDaysAgo;

        if (!shouldKeep) {
          totalCleaned++;
          modified = true;
        }
        return shouldKeep;
      });

      // Hard delete replies that:
      // - are soft deleted
      // - were deleted more than 30 days ago
      for (const comment of post.comments) {
        const before = comment.replies.length;
        comment.replies = comment.replies.filter((reply) => {
          const shouldKeep =
            !reply.deleted ||
            !reply.deletedAt ||
            reply.deletedAt > thirtyDaysAgo;
          if (!shouldKeep) totalCleaned++;
          return shouldKeep;
        });
        if (comment.replies.length !== before) modified = true;
      }

      if (modified) {
        await post.save({ validateBeforeSave: false });
      }
    }

    console.log(`✅ Cleanup done — removed ${totalCleaned} soft-deleted items`);
    return totalCleaned;
  } catch (error) {
    console.error("❌ Cleanup job error:", error.message);
    return 0;
  }
};

module.exports = { runCleanup };
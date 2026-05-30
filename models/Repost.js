const mongoose = require("mongoose");

// ── Secondary comment schema (resharer's own comment stream) ──────────────
const repostCommentSchema = new mongoose.Schema(
  {
    author:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    text:      { type: String, required: true, maxlength: 500 },
    edited:    { type: Boolean, default: false },
    deleted:   { type: Boolean, default: false },
    deletedAt: { type: Date,    default: null },
  },
  { timestamps: true }
);

// ── Main repost schema ────────────────────────────────────────────────────
const repostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    originalPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    // Guard: store the original author so we can block repost-of-repost
    // (set to original post's author when creating)
    originalAuthor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    thought: {
      type: String,
      default: "",
      maxlength: [300, "Thought cannot exceed 300 characters"],
    },
    pseudonym: { type: String, required: true },

    // ── Resharer's own secondary comment stream ──────────────────────────
    // Comments here belong to the resharer's context, not the original post.
    repostComments: {
      type: [repostCommentSchema],
      default: [],
    },
    repostCommentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Prevent duplicate reposts by the same user
repostSchema.index({ user: 1, originalPost: 1 }, { unique: true });
repostSchema.index({ createdAt: -1 });
repostSchema.index({ originalPost: 1 });

module.exports = mongoose.model("Repost", repostSchema);
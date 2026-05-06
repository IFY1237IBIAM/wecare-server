const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pseudonym: { type: String, required: true },
    text: {
      type: String,
      required: true,
      maxlength: [200, "Comment cannot exceed 200 characters"],
    },
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    pseudonym: { type: String, required: true },
    content: {
      type: String,
      required: [true, "Post content is required"],
      maxlength: [500, "Post cannot exceed 500 characters"],
    },
    mood: {
      type: String,
      enum: ["heartbreak", "fear", "sadness", "struggle", "hope"],
      default: "sadness",
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],
  },
  { timestamps: true }
);

// Index for faster feed queries
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
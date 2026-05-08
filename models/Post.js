const mongoose = require("mongoose");

const replySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    text: { type: String, required: true, maxlength: [200, "Reply cannot exceed 200 characters"] },
    isPostAuthor: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    text: { type: String, required: true, maxlength: [200, "Comment cannot exceed 200 characters"] },
    isPostAuthor: { type: Boolean, default: false },
    replies: [replySchema],
  },
  { timestamps: true }
);

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["care", "heart", "hug", "strong", "cry", "hope"], required: true },
});

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    content: { type: String, required: [true, "Post content is required"], maxlength: [500, "Post cannot exceed 500 characters"] },
    mood: { type: String, enum: ["heartbreak", "fear", "sadness", "struggle", "hope"], default: "sadness" },
    reactions: [reactionSchema],
    comments: [commentSchema],
    flagged: { type: Boolean, default: false },
    flagType: { type: String, default: null },
    edited: { type: Boolean, default: false },
  },
  { timestamps: true }
);

postSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
const mongoose = require("mongoose");

const replySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    text: { type: String, required: true, maxlength: [200, "Reply cannot exceed 200 characters"] },
    isPostAuthor: { type: Boolean, default: false },
    replyingTo: { type: String, default: null },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    text: { type: String, required: true, maxlength: [200, "Comment cannot exceed 200 characters"] },
    isPostAuthor: { type: Boolean, default: false },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    replies: [replySchema],
  },
  { timestamps: true }
);

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: {
    type: String,
    enum: ["care", "heart", "hug", "strong", "cry", "hope"],
    required: true,
  },
});

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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
    reactions: [reactionSchema],
    comments: [commentSchema],
    commentCount: { type: Number, default: 0 },
    flagged: { type: Boolean, default: false },
    flagType: { type: String, default: null },
    edited: { type: Boolean, default: false },
    hashtags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 5,
        message: "Maximum 5 hashtags per post",
      },
    },


    // Add this:
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null
    },
  },
  { timestamps: true }
);;

postSchema.index({ createdAt: -1 });
postSchema.index({ hashtags: 1 });

module.exports = mongoose.model("Post", postSchema);
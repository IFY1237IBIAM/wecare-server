const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 300 },
    isPostAuthor: { type: Boolean, default: false },
    editedAt: { type: Date }
  },
  { timestamps: true }
);

const groupPostSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    content: { type: String, required: true, trim: true, maxlength: 500 },
    mood: {
      type: String,
      enum: ["heartbreak", "fear", "sadness", "struggle", "hope", "joy", "calm"],
      default: "hope",
    },
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        type: { type: String, enum: ["care", "heart", "hug", "strong", "cry", "hope"] },
      },
    ],
    comments: [commentSchema],
  },
  { timestamps: true }
);

groupPostSchema.index({ group: 1, createdAt: -1 });
groupPostSchema.index({ "reactions.user": 1 });

module.exports = mongoose.model("GroupPost", groupPostSchema);
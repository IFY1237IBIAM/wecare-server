const mongoose = require("mongoose");

const repostSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    originalPost: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    thought: { type: String, default: "", maxlength: [300, "Thought cannot exceed 300 characters"] },
    pseudonym: { type: String, required: true },
  },
  { timestamps: true }
);

// Prevent duplicate reposts by the same user
repostSchema.index({ user: 1, originalPost: 1 }, { unique: true });
repostSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Repost", repostSchema);
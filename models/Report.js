const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: {
      type: String,
      enum: ["harmful_content", "spam", "inappropriate", "bullying", "misinformation", "other"],
      required: true,
    },
    details: { type: String, maxlength: 300 },
    status: {
      type: String,
      enum: ["pending", "reviewed", "actioned", "dismissed"],
      default: "pending",
    },
    autoFlagged: { type: Boolean, default: false },
    flagType: { type: String },
    postContent: { type: String },
    postPseudonym: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
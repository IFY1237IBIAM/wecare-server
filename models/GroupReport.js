const mongoose = require("mongoose");

const groupReportSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    groupName: { type: String },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reportedByPseudonym: { type: String, required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetUserPseudonym: { type: String, required: true },
    reason: {
      type: String,
      enum: ["harassment", "spam", "bullying", "inappropriate", "other"],
      required: true,
    },
    details: { type: String, default: "" },
    postContext: { type: String, default: "" }, // snippet of the offending message
    status: {
      type: String,
      enum: ["pending", "reviewed", "actioned", "dismissed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.GroupReport ||
  mongoose.model("GroupReport", groupReportSchema);
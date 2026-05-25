const mongoose = require("mongoose");

const groupPostSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    content: { type: String, required: true },
    mood: { type: String, default: "hope" },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "GroupPost", default: null },
    deleted: { type: Boolean, default: false },
    flagged: { type: Boolean, default: false },
    flagType: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.GroupPost || mongoose.model("GroupPost", groupPostSchema);
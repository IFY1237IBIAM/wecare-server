const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    topic: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    icon: { type: String, default: "💜" },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    creatorPseudonym: { type: String, required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    mutedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isClosed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Group || mongoose.model("Group", groupSchema);
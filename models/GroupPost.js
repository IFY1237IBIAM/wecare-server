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

    // "self" = author deleted it | "Crown_Keeper" = keeper deleted it
    deletedBy: { type: String, default: null },
    deletedByPseudonym: { type: String, default: null },

    flagged: { type: Boolean, default: false },
    flagType: { type: String, default: null },

    // Message status
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Edit support (within 5 min)
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    editHistory: [{
      content: String,
      editedAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

groupPostSchema.index({ group: 1, createdAt: 1 });

module.exports = mongoose.models.GroupPost || mongoose.model("GroupPost", groupPostSchema);
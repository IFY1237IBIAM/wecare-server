const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    topic: { type: String, required: true },
    description: { type: String, maxlength: 300 },
    icon: { type: String, default: "💜" },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    creatorPseudonym: { type: String },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isPrivate: { type: Boolean, default: true }
  },
  { timestamps: true }
);

groupSchema.index({ topic: 1 });

groupSchema.pre('save', function(next) {
  if (this.isNew && !this.members.includes(this.creator)) {
    this.members.push(this.creator);
  }
  next();
});

module.exports = mongoose.model("Group", groupSchema);
const mongoose = require("mongoose");

const appealSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pseudonym: { type: String, required: true },
    message: { type: String, required: true, maxlength: 1000 },
    violations: [{ reason: String, date: Date, postPreview: String }],
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedByPseudonym: { type: String },
    reviewNote: { type: String },
    reviewedAt: { type: Date },
    banId: { type: String }, // unique ID per ban event to enforce 1 appeal per ban
    appealRejected: { type: Boolean, default: false },
    
  },
  { timestamps: true }
);

appealSchema.index({ user: 1, banId: 1 });
appealSchema.index({ user: 1 }, { 
  unique: true, 
  partialFilterExpression: { status: "pending" } 
});
module.exports = mongoose.model("Appeal", appealSchema);
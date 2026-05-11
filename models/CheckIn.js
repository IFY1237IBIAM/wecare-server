const mongoose = require("mongoose");

const checkInSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    mood: {
      type: String,
      enum: ["heartbreak", "fear", "sadness", "struggle", "hope", "joy", "calm"],
      required: true,
    },
    note: { type: String, maxlength: 200, default: "" },
    date: { type: String, required: true }, // YYYY-MM-DD
  },
  { timestamps: true }
);

checkInSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model("CheckIn", checkInSchema);
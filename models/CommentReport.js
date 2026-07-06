const mongoose = require("mongoose");

const commentReportSchema = new mongoose.Schema(
  {
    reporter:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    post:        { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    commentId:   { type: String, required: true },
    replyId:     { type: String, default: null }, // null = comment report, set = reply report
    pseudonym:   { type: String }, // pseudonym of the reported commenter
    text:        { type: String }, // the actual comment/reply text at time of report
    reason:      { type: String, required: true,
                   enum: ["harmful_content","bullying","spam","inappropriate","misinformation","other"] },
    details:     { type: String, default: "" },
    status:      { type: String, default: "pending", enum: ["pending","reviewed","dismissed"] },
    type:        { type: String, default: "comment", enum: ["comment","reply"] },
  },
  { timestamps: true }
);

// Prevent same user reporting same comment twice
commentReportSchema.index({ reporter: 1, post: 1, commentId: 1, replyId: 1 }, { unique: true });

module.exports = mongoose.models.CommentReport ||
  mongoose.model("CommentReport", commentReportSchema);
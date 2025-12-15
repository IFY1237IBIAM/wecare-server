import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({
  url: String,
  type: String, // image | video
});

const postSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pseudonym: String,
    content: String,
    media: [mediaSchema],

    // reactionKey -> count
    reactions: {
      type: Map,
      of: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          reaction: String,
        },
      ],
    },


    // userId -> reactionKey
    userReactions: {
      type: Map,
      of: String,
      default: {},
    },

    comments: Array,
    readBy: [String],
    type: String,
    mood: String,
    anonymous: Boolean,
  },
  { timestamps: true }
);

export default mongoose.model("Post", postSchema);

import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({
  url: String,
  type: String, // image | video
});

const reactionUserSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reaction: String,
    pseudonym: String,
  },
  { _id: false }
);

/* =========================
   STEP 1 — COMMENT SCHEMAS
   ========================= */

const commentReactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reaction: String,
  },
  { _id: false }
);

const commentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pseudonym: String,
    text: String,

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // null = main comment, not a reply
    },

    reactions: {
      type: Map,
      of: [commentReactionSchema],
      default: {},
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

/* =========================
   POST SCHEMA
   ========================= */

const postSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pseudonym: String,
    content: String,
    media: [mediaSchema],

    // reactionKey -> [{ userId, reaction, pseudonym }]
    reactions: {
      type: Map,
      of: [reactionUserSchema],
      default: {},
    },

    // userId -> reactionKey
    userReactions: {
      type: Map,
      of: String,
      default: {},
    },

    comments: [commentSchema],
    readBy: [String],
    type: String,
    mood: String,
    anonymous: Boolean,
  },
  { timestamps: true }
);

export default mongoose.model("Post", postSchema);

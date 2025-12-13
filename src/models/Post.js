import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String },
  text: String,
  createdAt: { type: Date, default: Date.now },
});

const postSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pseudonym: { type: String },
    content: { type: String, maxlength: 500 },
    image: { type: String }, // url of image/video
    mediaType: { type: String }, // image/video
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reactions: { type: Map, of: Number },
    userReactions: { type: Map, of: Boolean },
    comments: [commentSchema],
    readBy: [String], // pseudonyms of users who read
    type: String,
    mood: String,
    anonymous: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Post', postSchema);

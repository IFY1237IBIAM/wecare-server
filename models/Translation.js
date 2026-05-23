// models/Translation.js
import mongoose from "mongoose";

const translationSchema = new mongoose.Schema({
  hash: { type: String, unique: true, index: true }, // sha256 of text + source + target
  sourceLang: String,
  targetLang: String,
  original: String,
  translated: String,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Translation", translationSchema);
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

mongoose.connect(process.env.MONGO_URI, { family: 4 }).then(async () => {
  const Post = require("../models/Post");
  const posts = await Post.find({});
  let updated = 0;

  for (const post of posts) {
    let count = 0;
    for (const comment of post.comments) {
      if (comment.deleted) continue;
      count += 1;
      for (const reply of comment.replies) {
        if (reply.deleted) continue;
        count += 1;
      }
    }
    post.commentCount = count;
    await post.save({ validateBeforeSave: false });
    updated++;
  }

  console.log(`✅ Migrated ${updated} posts`);
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
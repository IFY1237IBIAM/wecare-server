/**
 * fix-corrupted-field.js
 *
 * One-off script to clean the corrupted twoStepEnabled field
 * and remove stray junk keys from manual Atlas UI edits.
 *
 * Run from your backend folder:
 *   node fix-corrupted-field.js
 *
 * Make sure your .env file with MONGO_URI is in the same folder.
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db;

  // Step 1: Remove the corrupted field + stray junk keys
  const unsetResult = await db.collection("users").updateOne(
    { pseudonym: "mom" },
    {
      $unset: {
        twoStepEnabled: "",
        "Field name":   "",
        "Type":         "",
        "Value":        "",
      },
    }
  );
  console.log("Unset result:", unsetResult.modifiedCount, "document(s) modified");

  // Step 2: Write a brand new, clean twoStepEnabled field
  const setResult = await db.collection("users").updateOne(
    { pseudonym: "mom" },
    { $set: { twoStepEnabled: true } }
  );
  console.log("Set result:", setResult.modifiedCount, "document(s) modified");

  // Step 3: Verify via raw driver
  const rawDoc = await db.collection("users").findOne({ pseudonym: "mom" });
  console.log("");
  console.log("=== VERIFICATION (raw driver) ===");
  console.log("twoStepEnabled:", rawDoc.twoStepEnabled, "| typeof:", typeof rawDoc.twoStepEnabled);
  console.log("All keys:", Object.keys(rawDoc));

  // Step 4: Verify via Mongoose model (the part that was broken)
  const User = require("./models/User");
  const mongooseUser = await User.findOne({ pseudonym: "mom" }).select("+twoStepEnabled");
  console.log("");
  console.log("=== VERIFICATION (Mongoose) ===");
  console.log("twoStepEnabled:", mongooseUser.twoStepEnabled, "| typeof:", typeof mongooseUser.twoStepEnabled);

  await mongoose.disconnect();
  console.log("");
  console.log("Done. Disconnected.");
}

run().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
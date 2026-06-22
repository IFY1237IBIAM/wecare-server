/**
 * fix-corrupted-field-v2.js
 *
 * Generic version - works for ANY pseudonym, not hardcoded to "mom".
 * Run from your backend folder:
 *   node fix-corrupted-field-v2.js StargazerX
 */

require("dotenv").config();
const mongoose = require("mongoose");

const targetPseudonym = process.argv[2];

if (!targetPseudonym) {
  console.error("Usage: node fix-corrupted-field-v2.js <pseudonym>");
  process.exit(1);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB. Fixing account: ${targetPseudonym}`);

  const db = mongoose.connection.db;

  const before = await db.collection("users").findOne({ pseudonym: targetPseudonym });
  if (!before) {
    console.error(`No user found with pseudonym: ${targetPseudonym}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("");
  console.log("=== BEFORE ===");
  console.log("twoStepEnabled:", before.twoStepEnabled, "| typeof:", typeof before.twoStepEnabled);
  console.log("All keys:", Object.keys(before));

  // Step 1: Remove the corrupted field + any stray junk keys from manual Atlas edits
  const unsetResult = await db.collection("users").updateOne(
    { pseudonym: targetPseudonym },
    {
      $unset: {
        twoStepEnabled: "",
        "Field name":   "",
        "Type":         "",
        "Value":        "",
      },
    }
  );
  console.log("");
  console.log("Unset result:", unsetResult.modifiedCount, "document(s) modified");

  // Step 2: Write a brand new, clean twoStepEnabled field
  // Preserve whatever the PIN says it should be - we know twoStepPin exists
  // since the account clearly went through /enable successfully
  const setResult = await db.collection("users").updateOne(
    { pseudonym: targetPseudonym },
    { $set: { twoStepEnabled: true } }
  );
  console.log("Set result:", setResult.modifiedCount, "document(s) modified");

  // Step 3: Verify via raw driver
  const rawDoc = await db.collection("users").findOne({ pseudonym: targetPseudonym });
  console.log("");
  console.log("=== VERIFICATION (raw driver) ===");
  console.log("twoStepEnabled:", rawDoc.twoStepEnabled, "| typeof:", typeof rawDoc.twoStepEnabled);
  console.log("All keys:", Object.keys(rawDoc));

  // Step 4: Verify via Mongoose model (the part that was broken)
  const User = require("./models/User");
  const mongooseUser = await User.findOne({ pseudonym: targetPseudonym }).select("+twoStepEnabled");
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
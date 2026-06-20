/**
 * One-time cleanup script — run during testing only.
 * Deletes ALL check-in records so the new local-date logic starts clean,
 * with no leftover UTC-dated rows from before the fix.
 *
 * Usage (from your backend folder, in PowerShell or terminal):
 *   node clear_test_checkins.js
 *
 * Requires MONGO_URI in your .env (same one your server uses).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const CheckIn = require("./models/CheckIn");

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const result = await CheckIn.deleteMany({});
    console.log(`🗑️  Deleted ${result.deletedCount} check-in record(s).`);

    console.log("✅ Done. All check-ins cleared — ready for fresh local-date testing.");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await mongoose.disconnect();
  }
}

run();
/**
 * check-db-target.js
 *
 * Prints exactly which database and cluster this script's MONGO_URI
 * connects to, so we can compare against what Render is using.
 *
 * Run: node check-db-target.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  const uri = process.env.MONGO_URI;

  // Mask the password for safe display
  const maskedUri = uri.replace(/:([^:@]+)@/, ":****@");
  console.log("MONGO_URI (masked):", maskedUri);

  await mongoose.connect(uri);
  console.log("");
  console.log("Connected successfully");
  console.log("Database name:", mongoose.connection.db.databaseName);
  console.log("Host:", mongoose.connection.host);

  const count = await mongoose.connection.db.collection("users").countDocuments();
  console.log("Total users in this database:", count);

  const stargazer = await mongoose.connection.db.collection("users").findOne({ pseudonym: "StargazerX" });
  console.log("");
  console.log("StargazerX found in THIS database:", !!stargazer);
  if (stargazer) {
    console.log("StargazerX twoStepEnabled:", stargazer.twoStepEnabled);
    console.log("StargazerX _id:", stargazer._id);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
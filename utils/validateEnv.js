/**
 * utils/validateEnv.js
 *
 * Validates required environment variables on server startup.
 * If any critical variable is missing, the server exits immediately
 * with a clear error message instead of silently failing later
 * with a confusing runtime error.
 *
 * Add to server.js BEFORE dotenv.config() is used for anything:
 *   require("./utils/validateEnv")();
 */

const REQUIRED_VARS = [
  // Database
  { key: "MONGO_URI",       hint: "MongoDB Atlas connection string" },

  // Auth
  { key: "JWT_SECRET",      hint: "Strong random string for JWT signing" },
  { key: "JWT_EXPIRE",      hint: "Token expiry e.g. '7d' or '30d'" },

  // Email
  { key: "RESEND_API_KEY",  hint: "Resend API key from resend.com/api-keys" },

  // Passkeys / domain
  { key: "ANDROID_SHA256",  hint: "SHA256 fingerprint(s) for Android passkeys" },
  { key: "ANDROID_PACKAGE", hint: "Android package name e.g. com.hushcircle.app" },
];

const OPTIONAL_VARS = [
  { key: "APPLE_TEAM_ID",   hint: "Apple Team ID for iOS passkeys (needed for App Store)" },
  { key: "IOS_BUNDLE_ID",   hint: "iOS bundle ID e.g. com.hushcircle.app" },
  { key: "ADMIN_EMAIL",     hint: "Email that gets auto-promoted to admin on signup" },
  { key: "NODE_ENV",        hint: "Set to 'production' on Render" },
];

module.exports = function validateEnv() {
  let hasError = false;

  // Check required vars
  const missing = REQUIRED_VARS.filter((v) => !process.env[v.key]);
  if (missing.length > 0) {
    console.error("\n❌ MISSING REQUIRED ENVIRONMENT VARIABLES:\n");
    missing.forEach(({ key, hint }) => {
      console.error(`   ${key}`);
      console.error(`   → ${hint}\n`);
    });
    hasError = true;
  }

  // Warn about optional but important vars
  const missingOptional = OPTIONAL_VARS.filter((v) => !process.env[v.key]);
  if (missingOptional.length > 0) {
    console.warn("\n⚠️  OPTIONAL ENV VARS NOT SET (some features may not work):");
    missingOptional.forEach(({ key, hint }) => {
      console.warn(`   ${key} — ${hint}`);
    });
    console.warn("");
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error("❌ JWT_SECRET is too short — use at least 32 characters for security");
    hasError = true;
  }

  // Validate MONGO_URI format
  if (process.env.MONGO_URI && !process.env.MONGO_URI.startsWith("mongodb")) {
    console.error("❌ MONGO_URI doesn't look like a valid MongoDB connection string");
    hasError = true;
  }

  if (hasError) {
    console.error("\n🛑 Server startup aborted due to missing/invalid env vars.\n");
    process.exit(1);
  }

  console.log("✅ Environment variables validated");
};
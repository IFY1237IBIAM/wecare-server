/**
 * routes/wellKnownRoutes.js
 *
 * Serves the domain verification files required by Apple and Google
 * for passkey/WebAuthn to work.
 *
 * Mount BEFORE all other routes in server.js:
 *   app.use("/", require("./routes/wellKnownRoutes"));
 */

const express = require("express");
const router = express.Router();

// ── Config ─────────────────────────────────────────────────────────────────────
const ANDROID_PACKAGE = "com.hushcircle.app";

// We are using both debug + release fingerprints for now
const ANDROID_SHA256S = [
  "D4:06:CB:10:C8:6E:76:C6:5D:09:61:38:50:0E:1E:07:B6:4C:60:58:59:24:57:CF:6A:2B:13:74:60:01:3C:DF", // Debug
  "0E:73:88:4B:0D:0D:57:29:99:A2:3F:AD:94:A0:61:16:30:B5:2C:63:1A:13:24:B5:99:32:D4:44:40:4E:D2:D4"  // Release
];

// ── iOS: Apple App Site Association ──────────────────────────────────────────
// Commented out for now because you haven't enrolled in Apple Developer Program yet
// Uncomment and update when you get your Team ID ($99/year)
/*
router.get("/.well-known/apple-app-site-association", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json({
    applinks: {},
    webcredentials: {
      apps: [`${process.env.APPLE_TEAM_ID || "YOURTEAMID"}.com.hushcircle.app`],
    },
    appclips: {},
  });
});
*/

// ── Android: Digital Asset Links ─────────────────────────────────────────────
router.get("/.well-known/assetlinks.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");   // Good for debugging

  res.json([
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace:                "android_app",
        package_name:             ANDROID_PACKAGE,
        sha256_cert_fingerprints: ANDROID_SHA256S,
      },
    },
  ]);
});

module.exports = router;
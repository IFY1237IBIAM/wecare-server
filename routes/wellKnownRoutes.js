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

// ── Config from Environment Variables ─────────────────────────────────────
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || "com.hushcircle.app";

const ANDROID_SHA256S = process.env.ANDROID_SHA256 
  ? process.env.ANDROID_SHA256.split(",").map(s => s.trim())
  : [
      "D4:06:CB:10:C8:6E:76:C6:5D:09:61:38:50:0E:1E:07:B6:4C:60:58:59:24:57:CF:6A:2B:13:74:60:01:3C:DF", // Debug
      "0E:73:88:4B:0D:0D:57:29:99:A2:3F:AD:94:A0:61:16:30:B5:2C:63:1A:13:24:B5:99:32:D4:44:40:4E:D2:D4",  // Release
      "92:A1:43:5B:49:29:27:C7:E4:11:83:2E:95:78:3D:9E:93:12:AC:73:A7:84:B5:D2:21:A7:3E:47:ED:27:1F:3E"  // EAS preview keystore
    ];

// ── iOS: Apple App Site Association ──────────────────────────────────────────
// Commented out for now (you don't have Apple Developer Program yet)
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
  res.setHeader("Access-Control-Allow-Origin", "*");

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
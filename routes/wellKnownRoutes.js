/**
 * routes/wellKnownRoutes.js
 *
 * Serves the domain verification files required by Apple and Google
 * for passkey/WebAuthn to work. These MUST be reachable at your
 * PASSKEY_RP_ID domain over HTTPS before any passkey will work.
 *
 * Mount BEFORE all other routes in server.js:
 *   app.use("/", require("./routes/wellKnownRoutes"));
 *
 * Replace the placeholder values:
 *   APPLE_TEAM_ID     → Your Apple Developer Team ID
 *                       Find at: developer.apple.com/account → Membership
 *   IOS_BUNDLE_ID     → Same as expo.ios.bundleIdentifier in app.json
 *   ANDROID_PACKAGE   → Same as expo.android.package in app.json
 *   ANDROID_SHA256    → SHA-256 fingerprint of your Android signing certificate
 *                       Run: keytool -list -v -keystore release.keystore
 */

const express = require("express");
const router  = express.Router();

const APPLE_TEAM_ID   = process.env.APPLE_TEAM_ID   || "YOURTEAMID";
const IOS_BUNDLE_ID   = process.env.IOS_BUNDLE_ID   || "com.yourcompany.hushcircle";
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || "com.yourcompany.hushcircle";
const ANDROID_SHA256  = process.env.ANDROID_SHA256  || "YOUR:SHA256:FINGERPRINT:HERE";

// ── iOS: Apple App Site Association ──────────────────────────────────────────
// Required for passkeys to work on iOS 16+
router.get("/.well-known/apple-app-site-association", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json({
    applinks: {},
    webcredentials: {
      apps: [`${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`],
    },
    appclips: {},
  });
});

// ── Android: Digital Asset Links ─────────────────────────────────────────────
// Required for passkeys to work on Android 9+
router.get("/.well-known/assetlinks.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json([
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace:                "android_app",
        package_name:             ANDROID_PACKAGE,
        sha256_cert_fingerprints: [ANDROID_SHA256],
      },
    },
  ]);
});

module.exports = router;
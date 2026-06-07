/**
 * passkeyController.js
 *
 * True WebAuthn / FIDO2 passkey implementation using @simplewebauthn/server.
 * 
 * How it works (same as Google, Apple, WhatsApp):
 *   1. REGISTER:   Server issues a challenge → device creates a key pair in
 *                  Secure Enclave → device sends public key + attestation →
 *                  server verifies + stores public key only (never the private key).
 *   2. SIGN IN:    Server issues a challenge → device signs it with private key
 *                  (unlocked by Face ID / fingerprint) → server verifies signature
 *                  against stored public key → JWT issued.
 *
 * Nothing secret is stored on the server. The private key NEVER leaves the device.
 *
 * npm install @simplewebauthn/server
 */

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const User        = require("../models/User");
const Passkey     = require("../models/Passkey")
const jwt         = require("jsonwebtoken");

// ── Relying Party config ──────────────────────────────────────────────────────
// rpID must be your backend domain (no protocol, no port).
// For a React Native app, Apple / Google require a domain they can verify via
// apple-app-site-association / assetlinks.json.  Use your backend domain.
// e.g. wecare-backend-anxl.onrender.com  OR  your custom domain.
const RP_ID   = process.env.PASSKEY_RP_ID   || "wecare-backend-anxl.onrender.com";
const RP_NAME = process.env.PASSKEY_RP_NAME || "HushCircle";

// Origins that are allowed to complete ceremonies.
// For React Native (iOS/Android), the origin is the app's bundle ID prefixed with
// "android:apk-key-hash:..." or just the RPID domain for iOS.
// Add both your HTTPS backend domain AND your app bundle ID origins.
const EXPECTED_ORIGINS = process.env.PASSKEY_ORIGINS
  ? process.env.PASSKEY_ORIGINS.split(",").map((s) => s.trim())
  : [
      `https://${RP_ID}`,
      "android:apk-key-hash:YOUR_APK_HASH_HERE",  // replace with real APK hash
    ];

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });

// ── In-memory challenge store (replace with Redis in production) ──────────────
// Challenge must be consumed within 5 minutes and deleted after use.
const challengeStore = new Map(); // userId → { challenge, expiresAt }

function storeChallenge(userId, challenge) {
  challengeStore.set(String(userId), {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
  });
}

function consumeChallenge(userId) {
  const entry = challengeStore.get(String(userId));
  challengeStore.delete(String(userId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.challenge;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION — Step 1: GET /api/passkey/register/options
// Returns a challenge + options the device uses to create a key pair.
// ─────────────────────────────────────────────────────────────────────────────
exports.getRegistrationOptions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Collect existing credential IDs so we don't duplicate
    const existingPasskeys = await Passkey.find({ user: user._id });
    const excludeCredentials = existingPasskeys.map((p) => ({
      id:         Buffer.from(p.credentialID, "base64url"),
      type:       "public-key",
      transports: p.transports || ["internal"],
    }));

    const options = await generateRegistrationOptions({
      rpName:                  RP_NAME,
      rpID:                    RP_ID,
      userID:                  Buffer.from(String(user._id)),
      userName:                user.pseudonym,
      userDisplayName:         user.pseudonym,
      attestationType:         "none",          // "none" is fine for production
      excludeCredentials,
      authenticatorSelection:  {
        residentKey:       "required",          // passkey (discoverable credential)
        userVerification:  "required",          // enforce biometric / PIN
        authenticatorAttachment: "platform",    // Face ID / fingerprint only, no hardware keys
      },
      supportedAlgorithmIDs: [-7, -257],        // ES256 + RS256
    });

    storeChallenge(user._id, options.challenge);

    return res.json(options);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION — Step 2: POST /api/passkey/register/verify
// Verifies the attestation from the device and stores the public key.
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyRegistration = async (req, res) => {
  try {
    const { attestationResponse, deviceName } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const expectedChallenge = consumeChallenge(user._id);
    if (!expectedChallenge) {
      return res.status(400).json({ message: "Challenge expired or not found. Start registration again." });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response:            attestationResponse,
        expectedChallenge,
        expectedOrigin:      EXPECTED_ORIGINS,
        expectedRPID:        RP_ID,
        requireUserVerification: true,
      });
    } catch (verifyErr) {
      return res.status(400).json({ message: `Verification failed: ${verifyErr.message}` });
    }

    if (!verification.verified) {
      return res.status(400).json({ message: "Passkey verification failed." });
    }

    const { registrationInfo } = verification;
    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
    } = registrationInfo;

    // Save public key to database
    const passkey = await Passkey.create({
      user:              user._id,
      credentialID:      Buffer.from(credential.id).toString("base64url"),
      publicKey:         Buffer.from(credential.publicKey).toString("base64url"),
      counter:           credential.counter,
      deviceType:        credentialDeviceType,   // "singleDevice" | "multiDevice"
      backedUp:          credentialBackedUp,      // true if synced via iCloud/Google
      transports:        credential.transports || ["internal"],
      deviceName:        deviceName?.trim() || "Unknown device",
      createdAt:         new Date(),
    });

    // Mark passkeys as enabled on user
    await User.findByIdAndUpdate(user._id, { passkeyEnabled: true });

    return res.status(201).json({
      message:      "Passkey registered 💜",
      passkeyId:    passkey._id,
      deviceName:   passkey.deviceName,
      backedUp:     passkey.backedUp,
      createdAt:    passkey.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION — Step 1: POST /api/passkey/auth/options
// Body: { pseudonym }  — needed to look up allowCredentials
// ─────────────────────────────────────────────────────────────────────────────
exports.getAuthenticationOptions = async (req, res) => {
  try {
    const { pseudonym } = req.body;
    if (!pseudonym) return res.status(400).json({ message: "Pseudonym is required." });

    const user = await User.findOne({ pseudonym: pseudonym.trim() });
    if (!user) {
      // Security: don't leak whether user exists; still return valid-looking options
      return res.status(404).json({ message: "No passkey found for this account." });
    }

    const passkeys = await Passkey.find({ user: user._id });
    if (passkeys.length === 0) {
      return res.status(404).json({ message: "No passkey registered for this account." });
    }

    const allowCredentials = passkeys.map((p) => ({
      id:         Buffer.from(p.credentialID, "base64url"),
      type:       "public-key",
      transports: p.transports || ["internal"],
    }));

    const options = await generateAuthenticationOptions({
      rpID:                RP_ID,
      allowCredentials,
      userVerification:    "required",
      timeout:             60000,
    });

    storeChallenge(user._id, options.challenge);

    // Return options + userId so client can send it back in verify step
    return res.json({ ...options, userId: user._id });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION — Step 2: POST /api/passkey/auth/verify
// Verifies the assertion (signed challenge) from the device.
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyAuthentication = async (req, res) => {
  try {
    const { assertionResponse, userId } = req.body;
    if (!userId || !assertionResponse) {
      return res.status(400).json({ message: "userId and assertionResponse required." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBanned) return res.status(403).json({ message: "Account suspended." });

    // Find the credential that was used (match by credentialID)
    const credentialID = assertionResponse.id;
    const passkey = await Passkey.findOne({
      user:         user._id,
      credentialID: credentialID,
    });

    if (!passkey) {
      return res.status(404).json({ message: "Passkey not found. Please re-register." });
    }

    const expectedChallenge = consumeChallenge(user._id);
    if (!expectedChallenge) {
      return res.status(400).json({ message: "Challenge expired. Please try again." });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response:         assertionResponse,
        expectedChallenge,
        expectedOrigin:   EXPECTED_ORIGINS,
        expectedRPID:     RP_ID,
        credential: {
          id:         Buffer.from(passkey.credentialID, "base64url"),
          publicKey:  Buffer.from(passkey.publicKey,    "base64url"),
          counter:    passkey.counter,
          transports: passkey.transports,
        },
        requireUserVerification: true,
      });
    } catch (verifyErr) {
      return res.status(401).json({ message: `Authentication failed: ${verifyErr.message}` });
    }

    if (!verification.verified) {
      return res.status(401).json({ message: "Passkey authentication failed." });
    }

    // Update counter (replay-attack protection)
    await Passkey.findByIdAndUpdate(passkey._id, {
      counter:    verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    });

    // Issue JWT — same shape as password login
    const token = generateToken(user._id, user.role);

    return res.json({
      message: "Signed in with passkey 💜",
      token,
      user: {
        id:                  user._id,
        _id:                 user._id,
        pseudonym:           user.pseudonym,
        avatar:              user.avatar,
        role:                user.role,
        isBanned:            user.isBanned,
        confirmedViolations: user.confirmedViolations || 0,
        violations:          user.violations || [],
        appealStatus:        user.appealStatus || "none",
        showOnlineStatus:    user.showOnlineStatus,
        bio:                 user.bio || "",
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LIST passkeys for authenticated user
// GET /api/passkey/list
// ─────────────────────────────────────────────────────────────────────────────
exports.listPasskeys = async (req, res) => {
  try {
    const passkeys = await Passkey.find({ user: req.user._id })
      .select("deviceName createdAt lastUsedAt deviceType backedUp transports")
      .sort({ createdAt: -1 });

    return res.json({ passkeys });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE a passkey
// DELETE /api/passkey/:passkeyId
// ─────────────────────────────────────────────────────────────────────────────
exports.deletePasskey = async (req, res) => {
  try {
    const passkey = await Passkey.findOne({
      _id:  req.params.passkeyId,
      user: req.user._id,
    });

    if (!passkey) {
      return res.status(404).json({ message: "Passkey not found." });
    }

    await Passkey.findByIdAndDelete(passkey._id);

    // If no passkeys remain, clear the flag
    const remaining = await Passkey.countDocuments({ user: req.user._id });
    if (remaining === 0) {
      await User.findByIdAndUpdate(req.user._id, { passkeyEnabled: false });
    }

    return res.json({ message: "Passkey deleted.", remaining });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
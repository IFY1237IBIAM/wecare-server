/**
 * controllers/passkeyController.js — FINAL
 * Discoverable credentials + cross-install device detection
 */

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const User    = require("../models/User");
const Passkey = require("../models/Passkey");
const jwt     = require("jsonwebtoken");
const {
  sendPasskeyRegisteredEmail,
  sendPasskeyDeletedEmail,
} = require("../utils/email");

const {
  recordLogin,
  generateSessionId,
  getIpAddress,
} = require("./loginActivityController");

const RP_ID   = process.env.PASSKEY_RP_ID   || "wecare-backend-anxl.onrender.com";
const RP_NAME = process.env.PASSKEY_RP_NAME || "HushCircle";

let EXPECTED_ORIGINS = [`https://${RP_ID}`];
if (process.env.PASSKEY_ORIGINS) {
  EXPECTED_ORIGINS = process.env.PASSKEY_ORIGINS
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const generateToken = (id, role, sessionId) =>
  jwt.sign({ id, role, sessionId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });

const challengeStore = new Map();

function storeChallenge(key, challenge) {
  challengeStore.set(String(key), {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

function consumeChallenge(key) {
  const entry = challengeStore.get(String(key));
  challengeStore.delete(String(key));
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.challenge;
}

// ── GET /api/passkey/register/options ─────────────────────────────────────────
exports.getRegistrationOptions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const existing = await Passkey.find({
      user:         user._id,
      tier:         "webauthn",
      credentialID: { $ne: null },
    });

    const excludeCredentials = existing.map((p) => ({
      id:         Buffer.from(p.credentialID, "base64url"),
      type:       "public-key",
      transports: p.transports || ["internal"],
    }));

    const options = await generateRegistrationOptions({
      rpName:                 RP_NAME,
      rpID:                   RP_ID,
      userID:                 Buffer.from(String(user._id)),
      userName:               user.pseudonym,
      userDisplayName:        user.pseudonym,
      attestationType:        "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey:             "required",
        userVerification:        "required",
        authenticatorAttachment: "platform",
      },
      supportedAlgorithmIDs: [-7, -257],
    });

    storeChallenge(user._id, options.challenge);
    return res.json(options);
  } catch (err) {
    console.error("getRegistrationOptions error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/passkey/register/verify ─────────────────────────────────────────
exports.verifyRegistration = async (req, res) => {
  try {
    const { attestationResponse, deviceName, deviceId, fallback } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found." });

    // ── Tier 2: biometric fallback ────────────────────────────────────────────
    if (fallback === true || !attestationResponse) {
      const resolvedDeviceId   = deviceId   || "unknown";
      const resolvedDeviceName = deviceName?.trim() || "Device";

      const existingFallback = await Passkey.findOne({
        user:     user._id,
        tier:     "biometric",
        deviceId: resolvedDeviceId,
      });

      let passkey;
      if (existingFallback) {
        existingFallback.deviceName = resolvedDeviceName;
        existingFallback.updatedAt  = new Date();
        await existingFallback.save();
        passkey = existingFallback;
      } else {
        passkey = await Passkey.create({
          user:       user._id,
          tier:       "biometric",
          deviceId:   resolvedDeviceId,
          deviceName: resolvedDeviceName,
        });
      }

      await User.findByIdAndUpdate(user._id, { passkeyEnabled: true });

      sendPasskeyRegisteredEmail({
        to:         user.email,
        pseudonym:  user.pseudonym,
        deviceName: passkey.deviceName,
        createdAt:  passkey.createdAt,
      }).catch((err) => console.error("Passkey registered email failed:", err));

      return res.status(existingFallback ? 200 : 201).json({
        message:    existingFallback ? "Passkey updated 💜" : "Passkey registered 💜",
        passkeyId:  passkey._id,
        deviceName: passkey.deviceName,
        createdAt:  passkey.createdAt,
        tier:       "biometric",
      });
    }

    // ── Tier 1: true WebAuthn ─────────────────────────────────────────────────
    const expectedChallenge = consumeChallenge(user._id);
    if (!expectedChallenge) {
      return res.status(400).json({ message: "Challenge expired. Start registration again." });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response:                attestationResponse,
        expectedChallenge,
        expectedOrigin:          EXPECTED_ORIGINS,
        expectedRPID:            RP_ID,
        requireUserVerification: true,
      });
    } catch (verifyErr) {
      console.error("verifyRegistrationResponse error:", verifyErr);
      return res.status(400).json({ message: `Verification failed: ${verifyErr.message}` });
    }

    if (!verification.verified) {
      return res.status(400).json({ message: "Passkey verification failed." });
    }

    const { registrationInfo } = verification;
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

    // deviceId captured here too — enables checkDeviceHasPasskey lookups
    // BEFORE login, which is what powers "show passkey button after
    // uninstall+reinstall" detection.
    const passkey = await Passkey.create({
      user:         user._id,
      tier:         "webauthn",
      credentialID: Buffer.from(credential.id).toString("base64url"),
      publicKey:    Buffer.from(credential.publicKey).toString("base64url"),
      counter:      credential.counter,
      deviceType:   credentialDeviceType,
      backedUp:     credentialBackedUp,
      transports:   credential.transports || ["internal"],
      deviceName:   deviceName?.trim() || "Device",
      deviceId:     deviceId || null,
    });

    await User.findByIdAndUpdate(user._id, { passkeyEnabled: true });

    sendPasskeyRegisteredEmail({
      to:         user.email,
      pseudonym:  user.pseudonym,
      deviceName: passkey.deviceName,
      createdAt:  passkey.createdAt,
    }).catch((err) => console.error("Passkey registered email failed:", err));

    return res.status(201).json({
      message:    "Passkey registered 💜",
      passkeyId:  passkey._id,
      deviceName: passkey.deviceName,
      backedUp:   passkey.backedUp,
      createdAt:  passkey.createdAt,
      tier:       "webauthn",
    });
  } catch (err) {
    console.error("verifyRegistration error:", err.message, err.code);
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/passkey/check-device?deviceId=xxx ────────────────────────────────
// Public endpoint — no auth required. Used BEFORE login to decide whether
// to show the "Sign in with passkey" button. Only reveals a boolean —
// never which user or any account details. Safe for pre-auth use.
exports.checkDeviceHasPasskey = async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) {
      return res.json({ hasPasskey: false });
    }

    const passkey = await Passkey.findOne({
      deviceId,
      tier: "webauthn",
    }).select("_id");

    return res.json({ hasPasskey: !!passkey });
  } catch (err) {
    console.error("checkDeviceHasPasskey error:", err);
    // Fail closed — if anything goes wrong, just don't show the button
    return res.json({ hasPasskey: false });
  }
};

// ── POST /api/passkey/auth/options ────────────────────────────────────────────
exports.getAuthenticationOptions = async (req, res) => {
  try {
    const { pseudonym } = req.body;

    // ── DISCOVERABLE FLOW — no pseudonym provided ─────────────────────────────
    if (!pseudonym) {
      const tempKey = `discoverable_${Date.now()}_${Math.random()}`;
      const options = await generateAuthenticationOptions({
        rpID:             RP_ID,
        allowCredentials: [],
        userVerification: "required",
        timeout:          60000,
      });
      storeChallenge(tempKey, options.challenge);
      return res.json({ ...options, tempKey, discoverable: true });
    }

    // ── TARGETED FLOW — pseudonym provided ─────────────────────────────────────
    const user = await User.findOne({ pseudonym: pseudonym.trim() });
    if (!user) return res.status(404).json({ message: "No passkey found for this account." });

    const webAuthnPasskeys = await Passkey.find({
      user:         user._id,
      tier:         "webauthn",
      credentialID: { $ne: null },
    });
    const allPasskeys = await Passkey.find({ user: user._id });

    if (allPasskeys.length > 0 && webAuthnPasskeys.length === 0) {
      return res.json({ fallbackOnly: true, userId: user._id });
    }
    if (allPasskeys.length === 0) {
      return res.status(404).json({ message: "No passkey registered for this account." });
    }

    const allowCredentials = webAuthnPasskeys.map((p) => ({
      id:         Buffer.from(p.credentialID, "base64url"),
      type:       "public-key",
      transports: p.transports || ["internal"],
    }));

    const options = await generateAuthenticationOptions({
      rpID:             RP_ID,
      allowCredentials,
      userVerification: "required",
      timeout:          60000,
    });

    storeChallenge(user._id, options.challenge);
    return res.json({ ...options, userId: user._id });
  } catch (err) {
    console.error("getAuthenticationOptions error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/passkey/auth/verify ─────────────────────────────────────────────
exports.verifyAuthentication = async (req, res) => {
  try {
    const { assertionResponse, userId, tempKey } = req.body;
    if (!assertionResponse) {
      return res.status(400).json({ message: "assertionResponse is required." });
    }

    const credentialID = assertionResponse.id;

    let user;
    let passkey;

    if (userId) {
      user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found." });
      passkey = await Passkey.findOne({
        user: user._id,
        credentialID,
        tier: "webauthn",
      });
    } else {
      passkey = await Passkey.findOne({ credentialID, tier: "webauthn" });
      if (!passkey) {
        return res.status(404).json({ message: "Passkey not found. Please sign in with your password and re-register your passkey." });
      }
      user = await User.findById(passkey.user);
    }

    if (!passkey) {
      return res.status(404).json({ message: "Passkey not found. Please re-register." });
    }
    if (!user)         return res.status(404).json({ message: "User not found." });
    if (user.isBanned) return res.status(403).json({ message: "Account suspended." });

    const challengeKey      = tempKey || userId;
    const expectedChallenge = consumeChallenge(challengeKey);
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
      console.error("verifyAuthenticationResponse error:", verifyErr);
      return res.status(401).json({ message: `Authentication failed: ${verifyErr.message}` });
    }

    if (!verification.verified) {
      return res.status(401).json({ message: "Passkey authentication failed." });
    }

    await Passkey.findByIdAndUpdate(passkey._id, {
      counter:    verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    });

    const sessionId = generateSessionId();
    const token     = generateToken(user._id, user.role, sessionId);

    await recordLogin({
      userId:     user._id,
      sessionId,
      method:     "passkey",
      deviceName: req.body.deviceName || "Unknown device",
      deviceOS:   req.body.deviceOS   || "Unknown OS",
      ipAddress:  getIpAddress(req),
    });

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
        violations:          user.violations          || [],
        appealStatus:        user.appealStatus        || "none",
        showOnlineStatus:    user.showOnlineStatus,
        bio:                 user.bio                 || "",
      },
    });
  } catch (err) {
    console.error("verifyAuthentication error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/passkey/list ─────────────────────────────────────────────────────
exports.listPasskeys = async (req, res) => {
  try {
    const passkeys = await Passkey.find({ user: req.user._id })
      .select("deviceName createdAt lastUsedAt deviceType backedUp transports tier deviceId")
      .sort({ createdAt: -1 });
    return res.json({ passkeys });
  } catch (err) {
    console.error("listPasskeys error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/passkey/:passkeyId ────────────────────────────────────────────
exports.deletePasskey = async (req, res) => {
  try {
    const passkey = await Passkey.findOne({
      _id:  req.params.passkeyId,
      user: req.user._id,
    });
    if (!passkey) return res.status(404).json({ message: "Passkey not found." });

    const deletedName = passkey.deviceName;
    await Passkey.findByIdAndDelete(passkey._id);

    const remaining = await Passkey.countDocuments({ user: req.user._id });
    if (remaining === 0) {
      await User.findByIdAndUpdate(req.user._id, { passkeyEnabled: false });
    }

    User.findById(req.user._id)
      .select("email pseudonym")
      .then((user) => {
        if (!user) return;
        sendPasskeyDeletedEmail({
          to:         user.email,
          pseudonym:  user.pseudonym,
          deviceName: deletedName,
        }).catch((err) => console.error("Passkey deleted email failed:", err));
      })
      .catch(() => {});

    return res.json({ message: "Passkey deleted.", remaining });
  } catch (err) {
    console.error("deletePasskey error:", err);
    return res.status(500).json({ message: err.message });
  }
};
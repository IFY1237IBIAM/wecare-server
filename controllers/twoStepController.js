/**
 * controllers/twoStepController.js — PERMANENT FIX
 *
 * ROOT CAUSE CONFIRMED via extensive debugging across multiple accounts:
 * Mongoose's document hydration consistently fails to populate
 * `twoStepEnabled` from queries, even with correct .select() syntax,
 * correct schema definition, and no select:false on the field.
 * The raw MongoDB driver ALWAYS returns the correct value.
 *
 * This is reproducible across different accounts (mom, StargazerX),
 * ruling out data corruption — it is a genuine Mongoose-level issue.
 *
 * FIX: Use the raw MongoDB driver as the authoritative read AND write
 * path for twoStepEnabled specifically. Mongoose is still used for
 * everything else (bcrypt compare against twoStepPin, which works fine,
 * sending emails, basic user lookups).
 */

const User      = require("../models/User");
const mongoose  = require("mongoose");
const bcrypt    = require("bcryptjs");
const crypto    = require("crypto");
const {
  sendTwoStepEnabledEmail,
  sendTwoStepDisabledEmail,
  sendPinChangedEmail,
} = require("../utils/email");

const hashPin = async (pin) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(String(pin), salt);
};

const generateRecoveryCode = () =>
  crypto.randomBytes(5).toString("hex").toUpperCase();

// Helper: read the raw user document directly via the MongoDB driver.
// This bypasses Mongoose's document hydration entirely, which has
// been confirmed unreliable specifically for the twoStepEnabled field.
async function getRawUser(userId) {
  return mongoose.connection.db
    .collection("users")
    .findOne({ _id: new mongoose.Types.ObjectId(userId) });
}

// ── GET /api/two-step/status ──────────────────────────────────────────────────
exports.getTwoStepStatus = async (req, res) => {
  try {
    const rawUser = await getRawUser(req.user._id);
    if (!rawUser) return res.status(404).json({ message: "User not found." });
    return res.json({
      twoStepEnabled: rawUser.twoStepEnabled || false,
      twoStepHint:    rawUser.twoStepHint    || "",
      recoveryUsed:   rawUser.twoStepRecoveryUsed || false,
      passkeyEnabled: rawUser.passkeyEnabled || false,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/two-step/enable ─────────────────────────────────────────────────
exports.enableTwoStep = async (req, res) => {
  try {
    const { pin, hint } = req.body;
    if (!pin || !/^\d{6}$/.test(String(pin))) {
      return res.status(400).json({ message: "PIN must be exactly 6 digits." });
    }

    const rawUser = await getRawUser(req.user._id);
    if (!rawUser) return res.status(404).json({ message: "User not found." });
    if (rawUser.twoStepEnabled) {
      return res.status(400).json({ message: "Two-step verification is already enabled." });
    }

    const recoveryCode     = generateRecoveryCode();
    const hashedPin        = await hashPin(pin);
    const hashedRecovery   = await hashPin(recoveryCode);

    await mongoose.connection.db.collection("users").updateOne(
      { _id: rawUser._id },
      {
        $set: {
          twoStepPin:          hashedPin,
          twoStepHint:         hint?.trim().slice(0, 50) || "",
          twoStepRecoveryCode: hashedRecovery,
          twoStepRecoveryUsed: false,
          twoStepEnabled:      true,
        },
      }
    );

    sendTwoStepEnabledEmail({
      to:        rawUser.email,
      pseudonym: rawUser.pseudonym,
    }).catch((err) => console.error("Two-step enabled email failed (non-fatal):", err));

    return res.status(200).json({
      message:      "Two-step verification enabled 💜",
      recoveryCode,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/two-step/disable ────────────────────────────────────────────────
exports.disableTwoStep = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ message: "PIN is required." });

    const rawUser = await getRawUser(req.user._id);
    if (!rawUser) return res.status(404).json({ message: "User not found." });
    if (!rawUser.twoStepEnabled) {
      return res.status(400).json({ message: "Two-step verification is not enabled." });
    }

    const match = await bcrypt.compare(String(pin), rawUser.twoStepPin || "");
    if (!match) return res.status(401).json({ message: "Incorrect PIN." });

    await mongoose.connection.db.collection("users").updateOne(
      { _id: rawUser._id },
      {
        $set: {
          twoStepEnabled:      false,
          twoStepHint:         "",
          twoStepRecoveryUsed: false,
        },
        $unset: {
          twoStepPin:          "",
          twoStepRecoveryCode: "",
        },
      }
    );

    sendTwoStepDisabledEmail({
      to:        rawUser.email,
      pseudonym: rawUser.pseudonym,
    }).catch((err) => console.error("Two-step disabled email failed (non-fatal):", err));

    return res.json({ message: "Two-step verification disabled." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/two-step/verify  (no auth — pre-login) ─────────────────────────
exports.verifyTwoStep = async (req, res) => {
  try {
    const { pin, email } = req.body;
    if (!pin || !email) {
      return res.status(400).json({ message: "PIN and email are required." });
    }

    const rawUser = await mongoose.connection.db
      .collection("users")
      .findOne({ email: email.toLowerCase().trim() });

    if (!rawUser)                   return res.status(404).json({ message: "Account not found." });
    if (!rawUser.twoStepEnabled)    return res.status(400).json({ message: "Two-step not enabled for this account." });

    const match = await bcrypt.compare(String(pin), rawUser.twoStepPin || "");
    if (!match) {
      await new Promise((r) => setTimeout(r, 400));
      return res.status(401).json({ message: "Incorrect PIN. Please try again." });
    }
    return res.json({ verified: true, message: "PIN verified 💜" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/two-step/change-pin ─────────────────────────────────────────────
exports.changePin = async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    if (!currentPin) return res.status(400).json({ message: "Current PIN is required." });
    if (!newPin || !/^\d{6}$/.test(String(newPin))) {
      return res.status(400).json({ message: "New PIN must be exactly 6 digits." });
    }

    const rawUser = await getRawUser(req.user._id);
    if (!rawUser) return res.status(404).json({ message: "User not found." });

    const matchCurrent = await bcrypt.compare(String(currentPin), rawUser.twoStepPin || "");
    if (!matchCurrent) return res.status(401).json({ message: "Current PIN is incorrect." });

    const sameAsOld = await bcrypt.compare(String(newPin), rawUser.twoStepPin || "");
    if (sameAsOld) {
      return res.status(400).json({ message: "New PIN cannot be the same as your current PIN." });
    }

    const newHashedPin = await hashPin(newPin);

    await mongoose.connection.db.collection("users").updateOne(
      { _id: rawUser._id },
      { $set: { twoStepPin: newHashedPin } }
    );

    sendPinChangedEmail({
      to:        rawUser.email,
      pseudonym: rawUser.pseudonym,
    }).catch((err) => console.error("PIN changed email failed (non-fatal):", err));

    return res.json({ message: "PIN updated 💜" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/two-step/recover  (no auth — locked-out user) ──────────────────
exports.recoverTwoStep = async (req, res) => {
  try {
    const { email, recoveryCode, newPin } = req.body;
    if (!email || !recoveryCode || !newPin) {
      return res.status(400).json({ message: "Email, recovery code, and new PIN are required." });
    }
    if (!/^\d{6}$/.test(String(newPin))) {
      return res.status(400).json({ message: "New PIN must be exactly 6 digits." });
    }

    const rawUser = await mongoose.connection.db
      .collection("users")
      .findOne({ email: email.toLowerCase().trim() });

    if (!rawUser || !rawUser.twoStepEnabled) {
      return res.status(404).json({ message: "Account not found or two-step not enabled." });
    }
    if (rawUser.twoStepRecoveryUsed) {
      return res.status(400).json({
        message: "This recovery code has already been used. Contact support@hushcircle.com.",
      });
    }

    const match = await bcrypt.compare(
      recoveryCode.toUpperCase().trim(),
      rawUser.twoStepRecoveryCode || ""
    );
    if (!match) {
      await new Promise((r) => setTimeout(r, 400));
      return res.status(401).json({ message: "Invalid recovery code." });
    }

    const newHashedPin = await hashPin(newPin);

    await mongoose.connection.db.collection("users").updateOne(
      { _id: rawUser._id },
      { $set: { twoStepPin: newHashedPin, twoStepRecoveryUsed: true } }
    );

    sendPinChangedEmail({
      to:        rawUser.email,
      pseudonym: rawUser.pseudonym,
    }).catch((err) => console.error("Recovery PIN email failed (non-fatal):", err));

    return res.json({ message: "PIN reset successfully 💜 Sign in with your new PIN." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
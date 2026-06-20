/**
 * controllers/twoStepController.js — WITH TEMPORARY DEBUG LOGGING
 *
 * This version adds console.log statements inside disableTwoStep
 * so we can see EXACTLY what Render receives and what Mongoose returns,
 * directly in the Render logs in real time.
 *
 * REMOVE the console.log lines once the bug is confirmed fixed.
 */

const User   = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
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

// ── GET /api/two-step/status ──────────────────────────────────────────────────
exports.getTwoStepStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "twoStepEnabled twoStepHint twoStepRecoveryUsed passkeyEnabled"
    );
    if (!user) return res.status(404).json({ message: "User not found." });
    return res.json({
      twoStepEnabled: user.twoStepEnabled || false,
      twoStepHint:    user.twoStepHint    || "",
      recoveryUsed:   user.twoStepRecoveryUsed || false,
      passkeyEnabled: user.passkeyEnabled || false,
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
    const user = await User.findById(req.user._id)
      .select("+twoStepPin +twoStepEnabled email pseudonym");
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.twoStepEnabled) {
      return res.status(400).json({ message: "Two-step verification is already enabled." });
    }

    const recoveryCode       = generateRecoveryCode();
    user.twoStepPin          = await hashPin(pin);
    user.twoStepHint         = hint?.trim().slice(0, 50) || "";
    user.twoStepRecoveryCode = await hashPin(recoveryCode);
    user.twoStepRecoveryUsed = false;
    user.twoStepEnabled      = true;
    await user.save({ validateBeforeSave: false });

    sendTwoStepEnabledEmail({
      to:        user.email,
      pseudonym: user.pseudonym,
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
  console.log("🔍 DEBUG disableTwoStep CALLED");
  console.log("🔍 req.user._id:", req.user._id);
  console.log("🔍 req.user.id:", req.user.id);
  console.log("🔍 req.body.pin:", req.body.pin);

  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ message: "PIN is required." });

    const user = await User.findById(req.user._id)
      .select("+twoStepPin +twoStepEnabled email pseudonym");

    console.log("🔍 user found:", !!user);
    console.log("🔍 user._id:", user?._id);
    console.log("🔍 user.email:", user?.email);
    console.log("🔍 user.twoStepEnabled (raw):", user?.twoStepEnabled);
    console.log("🔍 typeof user.twoStepEnabled:", typeof user?.twoStepEnabled);
    console.log("🔍 user.twoStepPin exists:", !!user?.twoStepPin);
    console.log("🔍 FULL user object:", JSON.stringify(user, null, 2));

    if (!user) return res.status(404).json({ message: "User not found." });
    if (!user.twoStepEnabled) {
      console.log("🔍 BLOCKED HERE — user.twoStepEnabled was falsy:", user.twoStepEnabled);
      return res.status(400).json({ message: "Two-step verification is not enabled." });
    }

    const match = await bcrypt.compare(String(pin), user.twoStepPin || "");
    console.log("🔍 PIN match result:", match);
    if (!match) return res.status(401).json({ message: "Incorrect PIN." });

    const emailTo        = user.email;
    const emailPseudonym = user.pseudonym;

    user.twoStepEnabled      = false;
    user.twoStepPin          = undefined;
    user.twoStepHint         = "";
    user.twoStepRecoveryCode = undefined;
    user.twoStepRecoveryUsed = false;
    await user.save({ validateBeforeSave: false });

    sendTwoStepDisabledEmail({
      to:        emailTo,
      pseudonym: emailPseudonym,
    }).catch((err) => console.error("Two-step disabled email failed (non-fatal):", err));

    return res.json({ message: "Two-step verification disabled." });
  } catch (err) {
    console.log("🔍 EXCEPTION in disableTwoStep:", err.message);
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
    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select("+twoStepPin +twoStepEnabled");
    if (!user)                return res.status(404).json({ message: "Account not found." });
    if (!user.twoStepEnabled) return res.status(400).json({ message: "Two-step not enabled for this account." });

    const match = await bcrypt.compare(String(pin), user.twoStepPin || "");
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
    const user = await User.findById(req.user._id)
      .select("+twoStepPin email pseudonym");
    if (!user) return res.status(404).json({ message: "User not found." });

    const matchCurrent = await bcrypt.compare(String(currentPin), user.twoStepPin || "");
    if (!matchCurrent) return res.status(401).json({ message: "Current PIN is incorrect." });

    const sameAsOld = await bcrypt.compare(String(newPin), user.twoStepPin || "");
    if (sameAsOld) {
      return res.status(400).json({ message: "New PIN cannot be the same as your current PIN." });
    }

    user.twoStepPin = await hashPin(newPin);
    await user.save({ validateBeforeSave: false });

    sendPinChangedEmail({
      to:        user.email,
      pseudonym: user.pseudonym,
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
    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select("+twoStepRecoveryCode +twoStepRecoveryUsed +twoStepPin +twoStepEnabled pseudonym");
    if (!user || !user.twoStepEnabled) {
      return res.status(404).json({ message: "Account not found or two-step not enabled." });
    }
    if (user.twoStepRecoveryUsed) {
      return res.status(400).json({
        message: "This recovery code has already been used. Contact support@hushcircle.com.",
      });
    }
    const match = await bcrypt.compare(
      recoveryCode.toUpperCase().trim(),
      user.twoStepRecoveryCode || ""
    );
    if (!match) {
      await new Promise((r) => setTimeout(r, 400));
      return res.status(401).json({ message: "Invalid recovery code." });
    }

    user.twoStepPin          = await hashPin(newPin);
    user.twoStepRecoveryUsed = true;
    await user.save({ validateBeforeSave: false });

    sendPinChangedEmail({
      to:        user.email,
      pseudonym: user.pseudonym,
    }).catch((err) => console.error("Recovery PIN email failed (non-fatal):", err));

    return res.json({ message: "PIN reset successfully 💜 Sign in with your new PIN." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
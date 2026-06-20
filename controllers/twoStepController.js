/**
 * controllers/twoStepController.js — DEBUG v3
 *
 * Prints the EXACT schema paths Mongoose's live User model has registered,
 * directly from memory, to check for schema caching / duplicate registration.
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

// ── POST /api/two-step/disable — WITH SCHEMA INSPECTION ──────────────────────
exports.disableTwoStep = async (req, res) => {
  console.log("🔶🔶🔶 DEBUG v3 disableTwoStep CALLED");

  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ message: "PIN is required." });

    // ── Inspect the LIVE schema Mongoose has compiled in memory ──
    const schemaPaths = Object.keys(User.schema.paths);
    console.log("🔶 Schema has twoStepEnabled path:", schemaPaths.includes("twoStepEnabled"));
    console.log("🔶 Schema has twoStepPin path:", schemaPaths.includes("twoStepPin"));
    console.log("🔶 ALL schema paths:", schemaPaths.join(", "));

    // Check the exact options Mongoose has for twoStepEnabled specifically
    const twoStepEnabledPath = User.schema.paths["twoStepEnabled"];
    console.log("🔶 twoStepEnabled path definition exists:", !!twoStepEnabledPath);
    if (twoStepEnabledPath) {
      console.log("🔶 twoStepEnabled selectOption:", twoStepEnabledPath.selected);
      console.log("🔶 twoStepEnabled instance type:", twoStepEnabledPath.instance);
    }

    // How many times has "User" model been compiled? Check mongoose.models
    console.log("🔶 mongoose.modelNames():", mongoose.modelNames());

    const user = await User.findById(req.user._id)
      .select("+twoStepPin +twoStepEnabled email pseudonym");

    console.log("🔶 [MONGOOSE] twoStepEnabled:", user?.twoStepEnabled);

    // Try accessing it via get() method directly — bypasses any getter override
    console.log("🔶 [user.get()] twoStepEnabled:", user?.get ? user.get("twoStepEnabled") : "NO GET METHOD");

    // Try the document's raw internal storage
    console.log("🔶 [_doc] twoStepEnabled:", user?._doc?.twoStepEnabled);

    const rawDoc = await mongoose.connection.db
      .collection("users")
      .findOne({ _id: new mongoose.Types.ObjectId(req.user._id) });

    console.log("🔶 [RAW MONGODB] twoStepEnabled:", rawDoc?.twoStepEnabled);

    if (!user) return res.status(404).json({ message: "User not found." });

    const actualEnabled = rawDoc?.twoStepEnabled;

    if (!actualEnabled) {
      return res.status(400).json({
        message: "Two-step verification is not enabled.",
        debug: { mongooseValue: user.twoStepEnabled, rawValue: rawDoc?.twoStepEnabled },
      });
    }

    const match = await bcrypt.compare(String(pin), user.twoStepPin || rawDoc?.twoStepPin || "");
    if (!match) return res.status(401).json({ message: "Incorrect PIN." });

    const emailTo        = user.email;
    const emailPseudonym = user.pseudonym;

    // Use RAW MongoDB driver to update, bypassing Mongoose, since we know it works
    await mongoose.connection.db.collection("users").updateOne(
      { _id: new mongoose.Types.ObjectId(req.user._id) },
      {
        $set:   { twoStepEnabled: false, twoStepHint: "", twoStepRecoveryUsed: false },
        $unset: { twoStepPin: "", twoStepRecoveryCode: "" },
      }
    );

    sendTwoStepDisabledEmail({
      to:        emailTo,
      pseudonym: emailPseudonym,
    }).catch((err) => console.error("Two-step disabled email failed (non-fatal):", err));

    return res.json({ message: "Two-step verification disabled." });
  } catch (err) {
    console.log("🔶 EXCEPTION:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

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
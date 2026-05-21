const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const {
  validateEmailDeliverable,
  generateSixDigitCode,
  generateSecureToken,
  sendWelcomeEmail,
  sendPasswordResetEmail,
} = require("../utils/email");

const router = express.Router();

// ─── POST /api/email/verify-email ────────────────────────────────────────────
// Body: { token } OR { code, email }
router.post("/verify-email", async (req, res) => {
  try {
    const { token, code, email } = req.body;

    let user;

    if (token) {
      user = await User.findOne({
        emailVerificationToken: token,
        emailVerificationExpiry: { $gt: new Date() },
      }).select("+emailVerificationToken +emailVerificationExpiry");

      if (!user) {
        return res.status(400).json({ message: "Verification link is invalid or has expired." });
      }
    } else if (code && email) {
      user = await User.findOne({
        email: email.toLowerCase().trim(),
        emailVerificationCode: code,
        emailVerificationExpiry: { $gt: new Date() },
      }).select("+emailVerificationCode +emailVerificationExpiry");

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired verification code." });
      }
    } else {
      return res.status(400).json({ message: "Provide a verification token or code + email." });
    }

    if (user.isVerified) {
      return res.status(200).json({ message: "Email is already verified." });
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpiry = undefined;
    await user.save();

    return res.status(200).json({ message: "Email verified successfully. Welcome to HushCircle 💜" });
  } catch (err) {
    console.error("verify-email error:", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

// ─── POST /api/email/resend-verification ─────────────────────────────────────
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
      "+emailVerificationToken +emailVerificationCode +emailVerificationExpiry"
    );

    if (!user) return res.status(404).json({ message: "No account found with that email." });
    if (user.isVerified) return res.status(400).json({ message: "Email is already verified." });

    const code = generateSixDigitCode();
    const token = generateSecureToken();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    user.emailVerificationCode = code;
    user.emailVerificationToken = token;
    user.emailVerificationExpiry = expiry;
    await user.save();

    await sendWelcomeEmail({
      to: user.email,
      pseudonym: user.pseudonym,
      verifyToken: token,
      sixDigitCode: code,
    });

    return res.status(200).json({ message: "Verification email resent. Check your inbox." });
  } catch (err) {
    console.error("resend-verification error:", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

// ─── POST /api/email/forgot-password ─────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const emailCheck = await validateEmailDeliverable(email);
    if (!emailCheck.valid) {
      return res.status(400).json({ message: emailCheck.message });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return 200 to avoid user enumeration
    if (!user) {
      return res.status(200).json({
        message: "If that email is registered, you'll receive a reset code shortly.",
      });
    }

    const code = generateSixDigitCode();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    user.passwordResetCode = code;
    user.passwordResetExpiry = expiry;
    await user.save();

    await sendPasswordResetEmail({
      to: user.email,
      pseudonym: user.pseudonym,
      sixDigitCode: code,
    });

    return res.status(200).json({
      message: "If that email is registered, you'll receive a reset code shortly.",
    });
  } catch (err) {
    console.error("forgot-password error:", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

// ─── POST /api/email/reset-password ──────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: "Email, code, and new password are required." });
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters with uppercase, lowercase, number, and special character.",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      passwordResetCode: code,
      passwordResetExpiry: { $gt: new Date() },
    }).select("+passwordResetCode +passwordResetExpiry");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset code." });
    }

    user.password = newPassword; // pre-save hook hashes it
    user.passwordResetCode = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    return res.status(200).json({ message: "Password reset successfully. You can now sign in." });
  } catch (err) {
    console.error("reset-password error:", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

module.exports = router;
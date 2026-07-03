/**
 * routes/emailRoutes.js — WITH RATE LIMITING + INPUT VALIDATION
 *
 * Added rate limiting to all 4 routes:
 *   POST /forgot-password    — 5 per 15 min (stops email bombing)
 *   POST /reset-password     — 5 per 15 min (stops code brute-force)
 *   POST /verify-email       — 10 per 15 min (generous, tokens are longer)
 *   POST /resend-verification — 3 per 15 min (stops verification email spam)
 *
 * Also added validateEmail on forgot-password and resend-verification
 * so malformed emails are caught before hitting the DB or Resend.
 *
 * Everything else is your exact original code — unchanged.
 */

const express = require("express");
const crypto  = require("crypto");
const User    = require("../models/User");
const jwt     = require("jsonwebtoken");
const rateLimit   = require("express-rate-limit");
const { getClientIp } = require("../middleware/rateLimiters");
const { validateEmail } = require("../middleware/validators");
const {
  validateEmailDeliverable,
  generateSixDigitCode,
  generateSecureToken,
  sendWelcomeEmail,
  sendPasswordResetEmail,
} = require("../utils/email");

const router = express.Router();

// ─── Rate limiters ─────────────────────────────────────────────────────────────

// Strict — stops email bombing real users with reset codes
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many password reset requests. Please try again in 15 minutes." },
  skipSuccessfulRequests: false,   // count ALL attempts — even "user not found" ones
  keyGenerator: getClientIp,
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict — 6-digit code has only 1M combinations, must block brute-force
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many reset attempts. Please try again in 15 minutes." },
  skipSuccessfulRequests: true,
  keyGenerator: getClientIp,
  standardHeaders: true,
  legacyHeaders: false,
});

// Generous — verify-email tokens are long, lower brute-force risk
const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many verification attempts. Please try again in 15 minutes." },
  skipSuccessfulRequests: true,
  keyGenerator: getClientIp,
  standardHeaders: true,
  legacyHeaders: false,
});

// Strictest — resend spams real users' inboxes, 3 per 15 min is plenty
const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { message: "Too many resend requests. Please wait 15 minutes before trying again." },
  skipSuccessfulRequests: false,
  keyGenerator: getClientIp,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── POST /api/email/verify-email ────────────────────────────────────────────
// Body: { token } OR { code, email }
router.post("/verify-email", verifyEmailLimiter, async (req, res) => {
  try {
    const { token, code, email } = req.body;

    let user;

    if (token) {
      user = await User.findOne({
        emailVerificationToken: token,
        emailVerificationExpiry: { $gt: new Date() },
      }).select("+emailVerificationToken +emailVerificationExpiry");

      if (!user) {
        return res.status(400).json({
          message: "Verification link is invalid or has expired.",
        });
      }
    } else if (code && email) {
      user = await User.findOne({
        email: email.toLowerCase().trim(),
        emailVerificationCode: code,
        emailVerificationExpiry: { $gt: new Date() },
      }).select("+emailVerificationCode +emailVerificationExpiry");

      if (!user) {
        return res.status(400).json({
          message: "Invalid or expired verification code.",
        });
      }
    } else {
      return res.status(400).json({
        message: "Provide a verification token or code + email.",
      });
    }

    if (user.isVerified) {
      return res.status(200).json({
        message: "Email is already verified.",
      });
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpiry = undefined;
    await user.save();

    const authToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Email verified successfully. Welcome to HushCircle 💜",
      token: authToken,
      user: {
        _id:          user._id,
        email:        user.email,
        pseudonym:    user.pseudonym,
        isVerified:   user.isVerified,
        appealStatus: user.appealStatus,
        isBanned:     user.isBanned,
      },
    });
  } catch (err) {
    console.error("verify-email error:", err);
    return res.status(500).json({
      message: "Something went wrong. Please try again.",
    });
  }
});

// ─── POST /api/email/resend-verification ─────────────────────────────────────
router.post("/resend-verification", resendVerificationLimiter, validateEmail, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
      "+emailVerificationToken +emailVerificationCode +emailVerificationExpiry"
    );

    if (!user)          return res.status(404).json({ message: "No account found with that email." });
    if (user.isVerified) return res.status(400).json({ message: "Email is already verified." });

    const code   = generateSixDigitCode();
    const token  = generateSecureToken();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    user.emailVerificationCode   = code;
    user.emailVerificationToken  = token;
    user.emailVerificationExpiry = expiry;
    await user.save();

    await sendWelcomeEmail({
      to:          user.email,
      pseudonym:   user.pseudonym,
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
router.post("/forgot-password", forgotPasswordLimiter, validateEmail, async (req, res) => {
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

    const code   = generateSixDigitCode();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    user.passwordResetCode   = code;
    user.passwordResetExpiry = expiry;
    await user.save();

    await sendPasswordResetEmail({
      to:           user.email,
      pseudonym:    user.pseudonym,
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
router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
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
      email:               email.toLowerCase().trim(),
      passwordResetCode:   code,
      passwordResetExpiry: { $gt: new Date() },
    }).select("+passwordResetCode +passwordResetExpiry");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset code." });
    }

    user.password            = newPassword; // pre-save hook hashes it
    user.passwordResetCode   = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    return res.status(200).json({ message: "Password reset successfully. You can now sign in." });
  } catch (err) {
    console.error("reset-password error:", err);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

module.exports = router;
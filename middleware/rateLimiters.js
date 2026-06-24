/**
 * middleware/rateLimiters.js
 *
 * Centralized rate limiters for all security-sensitive endpoints.
 * Tuned per-endpoint based on actual brute-force risk:
 *   - Stricter on anything that checks a secret (PIN, recovery code)
 *   - Looser on normal authenticated actions
 *   - Per-IP by default (express-rate-limit's standard behavior)
 *
 * Usage in route files:
 *   const { twoStepVerifyLimiter } = require("../middleware/rateLimiters");
 *   router.post("/verify", twoStepVerifyLimiter, verifyTwoStep);
 */

const rateLimit = require("express-rate-limit");

// ── Helper: consistent JSON error shape matching your existing style ──────────
function limitMessage(message) {
  return { message };
}

// ─────────────────────────────────────────────────────────────────────────────
// TWO-STEP VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

// Guessing a 6-digit PIN — HIGH RISK, only 1,000,000 combinations.
// 5 attempts per 15 minutes per IP, matches your existing loginLimiter pattern.
const twoStepVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: limitMessage("Too many PIN attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Guessing a 10-character hex recovery code — lower risk than PIN
// (16^10 combinations) but still worth limiting since it's pre-login.
const twoStepRecoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: limitMessage("Too many recovery attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Enable/disable/change-pin require an existing valid session (authed),
// so risk is lower, but still cap to prevent automated abuse of a
// stolen/leaked token.
const twoStepActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many requests. Please slow down and try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// PASSKEY
// ─────────────────────────────────────────────────────────────────────────────

// Pre-login endpoint that takes a pseudonym — limits enumeration attempts
// (checking many pseudonyms to see which ones have passkeys registered).
const passkeyAuthOptionsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
});

// Pre-login endpoint that completes a passkey sign-in — same risk class
// as a password login attempt.
const passkeyAuthVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many sign-in attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Authenticated passkey registration — lower risk, generous limit
// just to prevent automated spam-registering devices.
const passkeyRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many passkey registration attempts. Please try again later."),
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN ACTIVITY
// ─────────────────────────────────────────────────────────────────────────────

// Authenticated, but revoke-all is destructive — cap to prevent abuse
// of a stolen token rapidly cycling sessions.
const loginActivityActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: limitMessage("Too many requests. Please slow down and try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT RECOVERY
// ─────────────────────────────────────────────────────────────────────────────

// Public, pre-login endpoint — the existing duplicate-pending check only
// blocks repeat submissions for the SAME email. This adds a true per-IP
// limit to stop someone submitting thousands of different fake emails.
const recoveryRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: limitMessage("Too many recovery requests from this device. Please try again later or contact support@hushcircle.org directly."),
  standardHeaders: true,
  legacyHeaders: false,
});

// Public status-check endpoint — low risk, but request IDs could be
// enumerated/guessed, so still worth a generous cap.
const recoveryStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: limitMessage("Too many requests. Please try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS (lower risk — already behind protect + adminOnly,
// but still capped in case a token is compromised)
// ─────────────────────────────────────────────────────────────────────────────

const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: limitMessage("Too many admin requests. Please slow down."),
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  twoStepVerifyLimiter,
  twoStepRecoverLimiter,
  twoStepActionLimiter,
  passkeyAuthOptionsLimiter,
  passkeyAuthVerifyLimiter,
  passkeyRegisterLimiter,
  loginActivityActionLimiter,
  recoveryRequestLimiter,
  recoveryStatusLimiter,
  adminActionLimiter,
};
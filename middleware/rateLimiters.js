/**
 * middleware/rateLimiters.js — FINAL, FIXED VERSION
 *
 * ROOT CAUSE FOUND: app.set("trust proxy", 1) only trusted ONE proxy hop,
 * but Render's infrastructure adds MULTIPLE internal hops. This caused
 * req.ip to inconsistently resolve to different internal 10.x.x.x
 * addresses on every request, making per-IP rate limiting unreliable
 * across ALL limiters in the app (confirmed via direct keyGenerator
 * logging — see investigation history).
 *
 * THE FIX (two parts):
 *   1. server.js: app.set("trust proxy", true) — trust the full chain
 *   2. THIS FILE: explicit getClientIp() helper that always reads the
 *      FIRST entry in X-Forwarded-For, which is the original client,
 *      used as a stable keyGenerator for every limiter below.
 *
 * IPv6 FIX: express-rate-limit v7+ requires IPv6 addresses to be
 * normalized through its ipKeyGenerator() helper before use as a rate
 * limit key. Without this, IPv6 clients can rotate addresses within
 * their assigned block and bypass limits entirely. IPv4 addresses pass
 * through ipKeyGenerator() unchanged, so this is safe for all clients.
 */

const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

function limitMessage(message) {
  return { message };
}

// ── Stable client IP extraction ────────────────────────────────────────────────
// The first entry in X-Forwarded-For is always the original client,
// regardless of how many internal proxy hops are added after it.
// ipKeyGenerator() normalizes IPv6 addresses (collapses to a /64 subnet)
// so rotating addresses within one block can't be used to dodge limits;
// IPv4 addresses pass through unchanged.
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = forwarded
    ? forwarded.split(",")[0].trim()
    : req.ip || req.connection?.remoteAddress || "unknown";
  return ipKeyGenerator(rawIp);
}

// ─────────────────────────────────────────────────────────────────────────────
// TWO-STEP VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

const twoStepVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: limitMessage("Too many PIN attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: getClientIp,
});

const twoStepRecoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: limitMessage("Too many recovery attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: getClientIp,
});

const twoStepActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many requests. Please slow down and try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
});

// ─────────────────────────────────────────────────────────────────────────────
// PASSKEY
// ─────────────────────────────────────────────────────────────────────────────

const passkeyAuthOptionsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
});

const passkeyAuthVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many sign-in attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: getClientIp,
});

const passkeyRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many passkey registration attempts. Please try again later."),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN ACTIVITY
// ─────────────────────────────────────────────────────────────────────────────

const loginActivityActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: limitMessage("Too many requests. Please slow down and try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT RECOVERY
// ─────────────────────────────────────────────────────────────────────────────

const recoveryRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: limitMessage("Too many recovery requests from this device. Please try again later or contact support@hushcircle.org directly."),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
});

const recoveryStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: limitMessage("Too many requests. Please try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
});

const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: limitMessage("Too many admin requests. Please slow down."),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
});

module.exports = {
  getClientIp,
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
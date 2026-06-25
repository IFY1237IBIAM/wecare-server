/**
 * middleware/rateLimiters.js — DEBUG VERSION
 *
 * Adds logging specifically to passkeyAuthOptionsLimiter to see
 * exactly what's happening at runtime, since this is the one
 * limiter that mysteriously never triggers despite identical
 * config to others that work correctly.
 */

const rateLimit = require("express-rate-limit");

function limitMessage(message) {
  return { message };
}

// ─────────────────────────────────────────────────────────────────────────────
// TWO-STEP VERIFICATION (unchanged - these work correctly)
// ─────────────────────────────────────────────────────────────────────────────

const twoStepVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: limitMessage("Too many PIN attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const twoStepRecoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: limitMessage("Too many recovery attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const twoStepActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many requests. Please slow down and try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// PASSKEY — WITH DEBUG LOGGING
// ─────────────────────────────────────────────────────────────────────────────

const passkeyAuthOptionsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,

  // DEBUG: log every single hit to this limiter, including the IP key
  // and current hit count, so we can see exactly what's happening
  handler: (req, res, next, options) => {
    console.log("🟠 passkeyAuthOptionsLimiter HANDLER FIRED (limit exceeded) - this should block now");
    res.status(options.statusCode).json(options.message);
  },

  // keyGenerator lets us see exactly what key is being used to track this IP
  keyGenerator: (req) => {
    const key = req.ip;
    console.log(`🟠 passkeyAuthOptionsLimiter keyGenerator called - key: ${key}`);
    return key;
  },
});

const passkeyAuthVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many sign-in attempts. Please try again in 15 minutes."),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const passkeyRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: limitMessage("Too many passkey registration attempts. Please try again later."),
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN ACTIVITY (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const loginActivityActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: limitMessage("Too many requests. Please slow down and try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT RECOVERY (unchanged - these work correctly)
// ─────────────────────────────────────────────────────────────────────────────

const recoveryRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: limitMessage("Too many recovery requests from this device. Please try again later or contact support@hushcircle.org directly."),
  standardHeaders: true,
  legacyHeaders: false,
});

const recoveryStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: limitMessage("Too many requests. Please try again shortly."),
  standardHeaders: true,
  legacyHeaders: false,
});

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
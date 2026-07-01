/**
 * routes/passkeyRoutes.js — WITH RATE LIMITING + INPUT VALIDATION
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");

const {
  passkeyAuthOptionsLimiter,
  passkeyAuthVerifyLimiter,
  passkeyRegisterLimiter,
} = require("../middleware/rateLimiters");

const { validatePseudonym } = require("../middleware/validators");

const {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  listPasskeys,
  deletePasskey,
} = require("../controllers/passkeyController");

[
  ["getRegistrationOptions", getRegistrationOptions],
  ["verifyRegistration",     verifyRegistration],
  ["getAuthenticationOptions", getAuthenticationOptions],
  ["verifyAuthentication",   verifyAuthentication],
  ["listPasskeys",           listPasskeys],
  ["deletePasskey",          deletePasskey],
].forEach(([name, fn]) => {
  if (typeof fn !== "function") {
    throw new Error(`passkeyController is missing export: "${name}".`);
  }
});

// Registration (user must already be logged in)
router.get ("/register/options", protect, passkeyRegisterLimiter, getRegistrationOptions);
router.post("/register/verify",  protect, passkeyRegisterLimiter, verifyRegistration);

// Authentication (no protect — user is signing in) — RATE LIMITED + VALIDATED
router.post("/auth/options", passkeyAuthOptionsLimiter, validatePseudonym, getAuthenticationOptions);
router.post("/auth/verify",  passkeyAuthVerifyLimiter,  verifyAuthentication);

// Management
router.get   ("/list",       protect, listPasskeys);
router.delete("/:passkeyId", protect, deletePasskey);

module.exports = router;
/**
 * routes/passkeyRoutes.js — WITH RATE LIMITING
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");

const {
  passkeyAuthOptionsLimiter,
  passkeyAuthVerifyLimiter,
  passkeyRegisterLimiter,
} = require("../middleware/rateLimiters");

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

// Registration (user must already be logged in) — rate limited to
// prevent automated spam-registering devices
router.get ("/register/options", protect, passkeyRegisterLimiter, getRegistrationOptions);
router.post("/register/verify",  protect, passkeyRegisterLimiter, verifyRegistration);

// Authentication (no protect — user is signing in) — RATE LIMITED
// since these are pre-login endpoints that could be used for
// enumeration or brute-force
router.post("/auth/options", passkeyAuthOptionsLimiter, getAuthenticationOptions);
router.post("/auth/verify",  passkeyAuthVerifyLimiter,  verifyAuthentication);

// Management
router.get   ("/list",       protect, listPasskeys);
router.delete("/:passkeyId", protect, deletePasskey);

module.exports = router;
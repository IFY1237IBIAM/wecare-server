/**
 * routes/passkeyRoutes.js — FINAL
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
  checkDeviceHasPasskey,
} = require("../controllers/passkeyController");

[
  ["getRegistrationOptions",   getRegistrationOptions],
  ["verifyRegistration",       verifyRegistration],
  ["getAuthenticationOptions", getAuthenticationOptions],
  ["verifyAuthentication",     verifyAuthentication],
  ["listPasskeys",             listPasskeys],
  ["deletePasskey",            deletePasskey],
  ["checkDeviceHasPasskey",    checkDeviceHasPasskey],
].forEach(([name, fn]) => {
  if (typeof fn !== "function") {
    throw new Error(`passkeyController is missing export: "${name}".`);
  }
});

// Registration (user must already be logged in)
router.get ("/register/options", protect, passkeyRegisterLimiter, getRegistrationOptions);
router.post("/register/verify",  protect, passkeyRegisterLimiter, verifyRegistration);

// Authentication (no protect — user is signing in)
router.post("/auth/options", passkeyAuthOptionsLimiter, getAuthenticationOptions);
router.post("/auth/verify",  passkeyAuthVerifyLimiter,  verifyAuthentication);

// Pre-login device detection (no protect — used before user is signed in)
router.get("/check-device", passkeyAuthOptionsLimiter, checkDeviceHasPasskey);

// Management
router.get   ("/list",       protect, listPasskeys);
router.delete("/:passkeyId", protect, deletePasskey);

module.exports = router;
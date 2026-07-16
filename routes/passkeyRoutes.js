/**
 * routes/passkeyRoutes.js — validatePseudonym REMOVED from auth/options
 *
 * The discoverable credential flow calls /auth/options with NO pseudonym
 * at all, so validatePseudonym (which requires it) would incorrectly
 * block that request. Validation now happens conditionally inside the
 * controller itself — if pseudonym IS provided, it still gets checked
 * there via the existing User.findOne() lookup.
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
  ["getRegistrationOptions",   getRegistrationOptions],
  ["verifyRegistration",       verifyRegistration],
  ["getAuthenticationOptions", getAuthenticationOptions],
  ["verifyAuthentication",     verifyAuthentication],
  ["listPasskeys",             listPasskeys],
  ["deletePasskey",            deletePasskey],
].forEach(([name, fn]) => {
  if (typeof fn !== "function") {
    throw new Error(`passkeyController is missing export: "${name}".`);
  }
});

// Registration (user must already be logged in)
router.get ("/register/options", protect, passkeyRegisterLimiter, getRegistrationOptions);
router.post("/register/verify",  protect, passkeyRegisterLimiter, verifyRegistration);

// Authentication (no protect — user is signing in)
// validatePseudonym REMOVED — pseudonym is now optional (discoverable flow)
router.post("/auth/options", passkeyAuthOptionsLimiter, getAuthenticationOptions);
router.post("/auth/verify",  passkeyAuthVerifyLimiter,  verifyAuthentication);

// Management
router.get   ("/list",       protect, listPasskeys);
router.delete("/:passkeyId", protect, deletePasskey);

module.exports = router;
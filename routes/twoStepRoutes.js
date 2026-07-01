/**
 * routes/twoStepRoutes.js — WITH RATE LIMITING + INPUT VALIDATION
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");

const {
  twoStepVerifyLimiter,
  twoStepRecoverLimiter,
  twoStepActionLimiter,
} = require("../middleware/rateLimiters");

const {
  validateEmail,
  validatePin,
} = require("../middleware/validators");

const {
  getTwoStepStatus,
  enableTwoStep,
  disableTwoStep,
  changePin,
  verifyTwoStep,
  recoverTwoStep,
} = require("../controllers/twoStepController");

[
  ["getTwoStepStatus", getTwoStepStatus],
  ["enableTwoStep",    enableTwoStep],
  ["disableTwoStep",   disableTwoStep],
  ["changePin",        changePin],
  ["verifyTwoStep",    verifyTwoStep],
  ["recoverTwoStep",   recoverTwoStep],
].forEach(([name, fn]) => {
  if (typeof fn !== "function") {
    throw new Error(`twoStepController is missing export: "${name}".`);
  }
});

// Protected — user must be logged in
router.get ("/status",     protect, getTwoStepStatus);
router.post("/enable",     protect, twoStepActionLimiter, validatePin, enableTwoStep);
router.post("/disable",    protect, twoStepActionLimiter, validatePin, disableTwoStep);
router.post("/change-pin", protect, twoStepActionLimiter, validatePin, changePin);

// No protect — user is not fully authenticated yet, but RATE LIMITED + VALIDATED
router.post("/verify",  twoStepVerifyLimiter,  validateEmail, validatePin, verifyTwoStep);
router.post("/recover", twoStepRecoverLimiter,  validateEmail, recoverTwoStep);

module.exports = router;
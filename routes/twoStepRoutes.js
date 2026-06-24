/**
 * routes/twoStepRoutes.js — WITH RATE LIMITING
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
router.post("/enable",     protect, twoStepActionLimiter, enableTwoStep);
router.post("/disable",    protect, twoStepActionLimiter, disableTwoStep);
router.post("/change-pin", protect, twoStepActionLimiter, changePin);

// No protect — user is not fully authenticated yet, but RATE LIMITED
// since these guess a 6-digit PIN or a recovery code
router.post("/verify",  twoStepVerifyLimiter,   verifyTwoStep);
router.post("/recover", twoStepRecoverLimiter,  recoverTwoStep);

module.exports = router;
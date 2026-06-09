/**
 * routes/twoStepRoutes.js
 * Mount: app.use("/api/two-step", require("./routes/twoStepRoutes"));
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");

const {
  getTwoStepStatus,
  enableTwoStep,
  disableTwoStep,
  changePin,
  verifyTwoStep,
  recoverTwoStep,
} = require("../controllers/twoStepController");

// Guard: catch missing exports early
[
  ["getTwoStepStatus", getTwoStepStatus],
  ["enableTwoStep",    enableTwoStep],
  ["disableTwoStep",   disableTwoStep],
  ["changePin",        changePin],
  ["verifyTwoStep",    verifyTwoStep],
  ["recoverTwoStep",   recoverTwoStep],
].forEach(([name, fn]) => {
  if (typeof fn !== "function") {
    throw new Error(
      `twoStepController is missing export: "${name}". ` +
      `Check controllers/twoStepController.js exports.`
    );
  }
});

// Protected — user must be logged in
router.get ("/status",     protect, getTwoStepStatus);
router.post("/enable",     protect, enableTwoStep);
router.post("/disable",    protect, disableTwoStep);
router.post("/change-pin", protect, changePin);

// No protect — user is not fully authenticated yet
router.post("/verify",  verifyTwoStep);
router.post("/recover", recoverTwoStep);

module.exports = router;
/**
 * routes/passkeyRoutes.js
 * Mount: app.use("/api/passkey", require("./routes/passkeyRoutes"));
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");

// Import each handler explicitly — avoids undefined if any export is missing
const {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  listPasskeys,
  deletePasskey,
} = require("../controllers/passkeyController");

// Guard: catch missing exports early with a clear error instead of a cryptic crash
[
  ["getRegistrationOptions", getRegistrationOptions],
  ["verifyRegistration",     verifyRegistration],
  ["getAuthenticationOptions", getAuthenticationOptions],
  ["verifyAuthentication",   verifyAuthentication],
  ["listPasskeys",           listPasskeys],
  ["deletePasskey",          deletePasskey],
].forEach(([name, fn]) => {
  if (typeof fn !== "function") {
    throw new Error(
      `passkeyController is missing export: "${name}". ` +
      `Check controllers/passkeyController.js exports.`
    );
  }
});

// Registration (user must already be logged in)
router.get ("/register/options", protect, getRegistrationOptions);
router.post("/register/verify",  protect, verifyRegistration);

// Authentication (no protect — user is signing in)
router.post("/auth/options", getAuthenticationOptions);
router.post("/auth/verify",  verifyAuthentication);

// Management
router.get   ("/list",       protect, listPasskeys);
router.delete("/:passkeyId", protect, deletePasskey);

module.exports = router;
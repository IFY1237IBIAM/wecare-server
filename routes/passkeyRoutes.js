/**
 * routes/passkeyRoutes.js
 * Mount: app.use("/api/passkey", require("./routes/passkeyRoutes"));
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");
const ctrl    = require("../controllers/passkeyController");

// Registration — user must be logged in
router.get ("/register/options", protect, ctrl.getRegistrationOptions);
router.post("/register/verify",  protect, ctrl.verifyRegistration);

// Authentication — no protect (user is signing in)
router.post("/auth/options", ctrl.getAuthenticationOptions);
router.post("/auth/verify",  ctrl.verifyAuthentication);

// Management
router.get   ("/list",        protect, ctrl.listPasskeys);
router.delete("/:passkeyId",  protect, ctrl.deletePasskey);

module.exports = router;
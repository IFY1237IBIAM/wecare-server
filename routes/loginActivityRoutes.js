/**
 * routes/loginActivityRoutes.js
 * Mount: app.use("/api/activity", require("./routes/loginActivityRoutes"));
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");// ← destructured to match your export style

const {
  getLoginHistory,
  revokeSession,
  revokeAllOtherSessions,
  markSessionInactive,
} = require("../controllers/loginActivityController");

router.get   ("/login-history",     protect, getLoginHistory);
router.delete("/revoke/:sessionId", protect, revokeSession);
router.delete("/revoke-all",        protect, revokeAllOtherSessions);
router.post  ("/mark-inactive",     protect, markSessionInactive);

module.exports = router;
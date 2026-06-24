/**
 * routes/loginActivityRoutes.js — WITH RATE LIMITING
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");

const { loginActivityActionLimiter } = require("../middleware/rateLimiters");

const {
  getLoginHistory,
  revokeSession,
  revokeAllOtherSessions,
  markSessionInactive,
} = require("../controllers/loginActivityController");

router.get   ("/login-history",     protect, getLoginHistory);
router.delete("/revoke/:sessionId", protect, loginActivityActionLimiter, revokeSession);
router.delete("/revoke-all",        protect, loginActivityActionLimiter, revokeAllOtherSessions);
router.post  ("/mark-inactive",     protect, markSessionInactive);

module.exports = router;
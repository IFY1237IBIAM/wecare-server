/**
 * routes/accountRecoveryRoutes.js — WITH RATE LIMITING
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");

const {
  recoveryRequestLimiter,
  recoveryStatusLimiter,
  adminActionLimiter,
} = require("../middleware/rateLimiters");

const {
  submitRecoveryRequest,
  getRequestStatus,
  listRecoveryRequests,
  getRecoveryRequestDetail,
  approveRecoveryRequest,
  rejectRecoveryRequest,
} = require("../controllers/accountRecoveryController");

[
  ["submitRecoveryRequest",     submitRecoveryRequest],
  ["getRequestStatus",          getRequestStatus],
  ["listRecoveryRequests",      listRecoveryRequests],
  ["getRecoveryRequestDetail",  getRecoveryRequestDetail],
  ["approveRecoveryRequest",    approveRecoveryRequest],
  ["rejectRecoveryRequest",     rejectRecoveryRequest],
].forEach(([name, fn]) => {
  if (typeof fn !== "function") {
    throw new Error(`accountRecoveryController is missing export: "${name}".`);
  }
});

// ── Public — no auth (the user is locked out), RATE LIMITED ──────────────────
router.post("/request",           recoveryRequestLimiter, submitRecoveryRequest);
router.get ("/status/:requestId", recoveryStatusLimiter,  getRequestStatus);

// ── Admin only — capped in case a token is compromised ────────────────────────
router.get ("/admin/requests",                    protect, adminOnly, adminActionLimiter, listRecoveryRequests);
router.get ("/admin/requests/:requestId",         protect, adminOnly, adminActionLimiter, getRecoveryRequestDetail);
router.post("/admin/requests/:requestId/approve", protect, adminOnly, adminActionLimiter, approveRecoveryRequest);
router.post("/admin/requests/:requestId/reject",  protect, adminOnly, adminActionLimiter, rejectRecoveryRequest);

module.exports = router;
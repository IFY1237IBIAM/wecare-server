/**
 * routes/accountRecoveryRoutes.js — WITH RATE LIMITING + INPUT VALIDATION
 */

const express = require("express");
const router  = express.Router();
const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
  recoveryRequestLimiter,
  recoveryStatusLimiter,
  adminActionLimiter,
} = require("../middleware/rateLimiters");

const {
  validateEmail,
  validateStringField,
} = require("../middleware/validators");

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

// ── Public — no auth (the user is locked out), RATE LIMITED + VALIDATED ──────
router.post(
  "/request",
  recoveryRequestLimiter,
  validateEmail,
  validateStringField("pseudonym", { required: true, maxLength: 20 }),
  validateStringField("reason",    { required: true, minLength: 20, maxLength: 1000 }),
  submitRecoveryRequest
);
router.get ("/status/:requestId", recoveryStatusLimiter,  getRequestStatus);

// ── Admin only — capped in case a token is compromised ────────────────────────
router.get ("/admin/requests",                    protect, adminOnly, adminActionLimiter, listRecoveryRequests);
router.get ("/admin/requests/:requestId",         protect, adminOnly, adminActionLimiter, getRecoveryRequestDetail);
router.post("/admin/requests/:requestId/approve", protect, adminOnly, adminActionLimiter, approveRecoveryRequest);
router.post("/admin/requests/:requestId/reject",  protect, adminOnly, adminActionLimiter, rejectRecoveryRequest);

module.exports = router;
/**
 * routes/accountRecoveryRoutes.js
 * Mount: app.use("/api/recovery", require("./routes/accountRecoveryRoutes"));
 */

const express = require("express");
const router  = express.Router();
const { protect, adminOnly } = require("../middleware/auth");

const {
  submitRecoveryRequest,
  getRequestStatus,
  listRecoveryRequests,
  getRecoveryRequestDetail,
  approveRecoveryRequest,
  rejectRecoveryRequest,
} = require("../controllers/accountRecoveryController");

// Guard: catch missing exports early
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

// ── Public — no auth (the user is locked out) ─────────────────────────────────
router.post("/request",              submitRecoveryRequest);
router.get ("/status/:requestId",    getRequestStatus);

// ── Admin only ──────────────────────────────────────────────────────────────
router.get ("/admin/requests",                      protect, adminOnly, listRecoveryRequests);
router.get ("/admin/requests/:requestId",           protect, adminOnly, getRecoveryRequestDetail);
router.post("/admin/requests/:requestId/approve",   protect, adminOnly, approveRecoveryRequest);
router.post("/admin/requests/:requestId/reject",    protect, adminOnly, rejectRecoveryRequest);

module.exports = router;
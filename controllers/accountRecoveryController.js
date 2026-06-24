/**
 * controllers/accountRecoveryController.js
 *
 * Handles the fully-locked-out recovery flow:
 *   - User submits a recovery request (no auth required)
 *   - Admin lists, approves, or rejects requests
 *   - Approval disables two-step on the real account so the user
 *     can log in normally with just their password (or reset it)
 *
 * Uses the raw MongoDB driver for User field reads/updates,
 * consistent with the proven-reliable pattern from twoStepController.js.
 */

const mongoose              = require("mongoose");
const AccountRecoveryRequest = require("../models/AccountRecoveryRequest");
const {
  sendRecoveryRequestReceivedEmail,
  sendRecoveryApprovedEmail,
  sendRecoveryRejectedEmail,
} = require("../utils/email");

function getIpAddress(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    ""
  );
}

// ── POST /api/recovery/request  (no auth — locked-out user) ──────────────────
exports.submitRecoveryRequest = async (req, res) => {
  try {
    const { email, pseudonym, accountAge, reason } = req.body;

    if (!email || !pseudonym || !reason) {
      return res.status(400).json({ message: "Email, pseudonym, and reason are required." });
    }
    if (reason.trim().length < 20) {
      return res.status(400).json({
        message: "Please provide a bit more detail about your situation (at least 20 characters).",
      });
    }

    const normalizedEmail     = email.toLowerCase().trim();
    const normalizedPseudonym = pseudonym.trim();

    // Look up the real account, if it exists, for the admin's comparison snapshot
    const realUser = await mongoose.connection.db
      .collection("users")
      .findOne({ email: normalizedEmail });

    // Rate-limit: prevent spamming requests for the same email
    const recentRequest = await AccountRecoveryRequest.findOne({
      submittedEmail: normalizedEmail,
      status:         "pending",
    });
    if (recentRequest) {
      return res.status(400).json({
        message: "You already have a pending recovery request. Please wait for it to be reviewed.",
      });
    }

    const request = await AccountRecoveryRequest.create({
      user:                 realUser?._id || null,
      submittedEmail:       normalizedEmail,
      submittedPseudonym:   normalizedPseudonym,
      submittedAccountAge:  accountAge?.trim().slice(0, 200) || "",
      reason:               reason.trim().slice(0, 1000),
      actualPseudonym:      realUser?.pseudonym      || "",
      actualEmail:          realUser?.email          || "",
      actualCreatedAt:      realUser?.createdAt      || null,
      actualTwoStepEnabled: realUser?.twoStepEnabled || false,
      actualPasskeyEnabled: realUser?.passkeyEnabled || false,
      ipAddress:            getIpAddress(req),
    });

    // Send confirmation email — non-fatal, and only if we found a real account
    // (avoids confirming/denying account existence to an attacker)
    if (realUser?.email) {
      sendRecoveryRequestReceivedEmail({
        to:        realUser.email,
        pseudonym: realUser.pseudonym,
      }).catch((err) => console.error("Recovery received email failed (non-fatal):", err));
    }

    // Always return the same generic message regardless of whether
    // a matching account was found — prevents account enumeration
    return res.status(201).json({
      message: "Your recovery request has been submitted. We'll review it and email you within 24-48 hours.",
      requestId: request._id,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/recovery/status/:requestId  (no auth — user checking their own request) ─
exports.getRequestStatus = async (req, res) => {
  try {
    const request = await AccountRecoveryRequest.findById(req.params.requestId)
      .select("status createdAt reviewedAt");
    if (!request) return res.status(404).json({ message: "Request not found." });
    return res.json({
      status:     request.status,
      submittedAt: request.createdAt,
      reviewedAt:  request.reviewedAt,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/recovery/admin/requests  (admin only) ────────────────────────────
exports.listRecoveryRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const requests = await AccountRecoveryRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("reviewedBy", "pseudonym");

    return res.json({ requests });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/recovery/admin/requests/:requestId  (admin only) ─────────────────
exports.getRecoveryRequestDetail = async (req, res) => {
  try {
    const request = await AccountRecoveryRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: "Request not found." });

    // Refresh the actual account snapshot in case it's changed since submission
    let liveAccount = null;
    if (request.user) {
      liveAccount = await mongoose.connection.db
        .collection("users")
        .findOne({ _id: request.user });
    }

    return res.json({
      request,
      liveAccount: liveAccount
        ? {
            pseudonym:      liveAccount.pseudonym,
            email:          liveAccount.email,
            createdAt:      liveAccount.createdAt,
            twoStepEnabled: liveAccount.twoStepEnabled,
            passkeyEnabled: liveAccount.passkeyEnabled,
            isBanned:       liveAccount.isBanned,
          }
        : null,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/recovery/admin/requests/:requestId/approve  (admin only) ───────
exports.approveRecoveryRequest = async (req, res) => {
  try {
    const { adminNote } = req.body;
    const request = await AccountRecoveryRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: "Request not found." });
    if (request.status !== "pending") {
      return res.status(400).json({ message: `Request has already been ${request.status}.` });
    }
    if (!request.user) {
      return res.status(400).json({
        message: "Cannot approve — no matching account was found for this email.",
      });
    }

    // Disable two-step and clear passkey-related flags via raw driver
    // (consistent with the proven-reliable pattern from twoStepController.js)
    await mongoose.connection.db.collection("users").updateOne(
      { _id: request.user },
      {
        $set: {
          twoStepEnabled:      false,
          twoStepHint:         "",
          twoStepRecoveryUsed: false,
        },
        $unset: {
          twoStepPin:          "",
          twoStepRecoveryCode: "",
        },
      }
    );

    request.status     = "approved";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.adminNote  = adminNote?.trim().slice(0, 500) || "";
    await request.save();

    sendRecoveryApprovedEmail({
      to:        request.actualEmail,
      pseudonym: request.actualPseudonym,
    }).catch((err) => console.error("Recovery approved email failed (non-fatal):", err));

    return res.json({ message: "Recovery request approved. Two-step has been disabled on the account." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/recovery/admin/requests/:requestId/reject  (admin only) ────────
exports.rejectRecoveryRequest = async (req, res) => {
  try {
    const { adminNote } = req.body;
    const request = await AccountRecoveryRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ message: "Request not found." });
    if (request.status !== "pending") {
      return res.status(400).json({ message: `Request has already been ${request.status}.` });
    }

    request.status     = "rejected";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.adminNote  = adminNote?.trim().slice(0, 500) || "";
    await request.save();

    // Only email if we have a real account email on file
    if (request.actualEmail) {
      sendRecoveryRejectedEmail({
        to:        request.actualEmail,
        pseudonym: request.actualPseudonym,
      }).catch((err) => console.error("Recovery rejected email failed (non-fatal):", err));
    }

    return res.json({ message: "Recovery request rejected." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
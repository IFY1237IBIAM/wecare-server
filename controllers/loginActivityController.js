/**
 * controllers/loginActivityController.js
 *
 * Handles reading and revoking login sessions.
 * Writing login activity happens inside authController and passkeyController.
 */

const LoginActivity = require("../models/LoginActivity");
const User          = require("../models/User");
const crypto        = require("crypto");

// ── Helper: get IP from request ────────────────────────────────────────────────
function getIpAddress(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    ""
  );
}

// ── Helper: get location from IP ───────────────────────────────────────────────
// Uses ip-api.com free tier (no key needed, 45 req/min)
// In production you can swap this for ipinfo.io or MaxMind
async function getLocationFromIP(ip) {
  try {
    // Skip private/local IPs
    if (
      !ip ||
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.startsWith("192.168.") ||
      ip.startsWith("10.") ||
      ip.startsWith("172.")
    ) {
      return { city: "Local network", country: "Development", flag: "🏠" };
    }

    const res  = await fetch(`http://ip-api.com/json/${ip}?fields=city,country,countryCode`);
    const data = await res.json();

    if (data.status === "fail") {
      return { city: "", country: "", flag: "" };
    }

    // Convert country code to flag emoji
    const flag = data.countryCode
      ? data.countryCode
          .toUpperCase()
          .split("")
          .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
          .join("")
      : "";

    return {
      city:    data.city    || "",
      country: data.country || "",
      flag,
    };
  } catch {
    return { city: "", country: "", flag: "" };
  }
}

// ── Helper: generate a short session ID ───────────────────────────────────────
function generateSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

// ── EXPORTED HELPER: record a login event ─────────────────────────────────────
// Called from authController.login and passkeyController.verifyAuthentication
// Non-fatal — never blocks the login response

async function recordLogin({
  userId,
  sessionId,
  method = "password",
  deviceName = "Unknown device",
  deviceOS   = "Unknown OS",
  appVersion = "",
  ipAddress  = "",
}) {
  try {
    const location = await getLocationFromIP(ipAddress);

    await LoginActivity.create({
      user: userId,
      sessionId,
      method,
      deviceName,
      deviceOS,
      appVersion,
      ipAddress,
      city:    location.city,
      country: location.country,
      flag:    location.flag,
      isActive: true,
    });
  } catch (err) {
    console.error("recordLogin error (non-fatal):", err.message);
  }
}

// ── GET /api/activity/login-history ───────────────────────────────────────────
// Returns last 20 login events for the current user
exports.getLoginHistory = async (req, res) => {
  try {
    const activities = await LoginActivity.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("-user -__v");

    // Mark which session is current (matches the sessionId in their JWT)
    const currentSessionId = req.user.sessionId || null;
    const result = activities.map((a) => ({
      ...a.toObject(),
      isCurrent: currentSessionId ? a.sessionId === currentSessionId : false,
    }));

    return res.json({ activities: result });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/activity/revoke/:sessionId ─────────────────────────────────────
// Revokes (marks inactive) a specific session
// The JWT for that session will still be valid until it expires,
// but you can add a check in your auth middleware to reject revoked sessions
exports.revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const activity = await LoginActivity.findOne({
      user:      req.user._id,
      sessionId,
    });

    if (!activity) {
      return res.status(404).json({ message: "Session not found." });
    }

    // Cannot revoke current session via this endpoint — use logout instead
    const currentSessionId = req.user.sessionId || null;
    if (currentSessionId && sessionId === currentSessionId) {
      return res.status(400).json({
        message: "Cannot revoke your current session. Use Sign Out instead.",
      });
    }

    activity.isActive  = false;
    activity.revokedAt = new Date();
    await activity.save();

    return res.json({ message: "Session revoked." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/activity/revoke-all ───────────────────────────────────────────
// Revokes ALL other sessions (keeps current one active)
exports.revokeAllOtherSessions = async (req, res) => {
  try {
    const currentSessionId = req.user.sessionId || null;

    await LoginActivity.updateMany(
      {
        user:      req.user._id,
        isActive:  true,
        sessionId: { $ne: currentSessionId },
      },
      {
        $set: {
          isActive:  false,
          revokedAt: new Date(),
        },
      }
    );

    return res.json({ message: "All other sessions have been signed out." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── Mark session inactive on logout ───────────────────────────────────────────
// Called from authController.setOffline or a dedicated logout endpoint
exports.markSessionInactive = async (req, res) => {
  try {
    const currentSessionId = req.user.sessionId || null;
    if (currentSessionId) {
      await LoginActivity.findOneAndUpdate(
        { user: req.user._id, sessionId: currentSessionId },
        { $set: { isActive: false, revokedAt: new Date() } }
      );
    }
    return res.json({ message: "Session marked inactive." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  ...exports,
  recordLogin,
  generateSessionId,
  getIpAddress,
};
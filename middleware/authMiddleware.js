/**
 * middleware/authMiddleware.js — WITH SESSION INVALIDATION ON PASSWORD CHANGE
 *
 * Added: checks req.user's JWT iat (issued-at) against the User document's
 * passwordChangedAt field. If the password was changed AFTER the token was
 * issued, the token is rejected with 401.
 *
 * This means:
 *   - When a user changes/resets their password, ALL tokens issued before
 *     that moment stop working on their next authenticated request
 *   - The device that performed the password change gets a fresh token
 *     immediately (authController/emailController returns a new token after
 *     the reset), so that device stays logged in
 *   - Every other device gets a 401 on their next API call and is
 *     redirected to the login screen
 *
 * This matches exactly what Google, WhatsApp, and most major apps do.
 *
 * REQUIRED CHANGE IN USER MODEL:
 *   Add this field to your User schema in models/User.js:
 *     passwordChangedAt: { type: Date, default: null }
 *
 * REQUIRED CHANGE IN emailRoutes.js reset-password handler:
 *   After user.password = newPassword, add:
 *     user.passwordChangedAt = new Date();
 *
 * REQUIRED CHANGE IN settingsController.js (if change-password exists):
 *   After saving the new password, add:
 *     user.passwordChangedAt = new Date();
 */

const jwt  = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) return res.status(401).json({ message: "Not authorized, no token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "User no longer exists" });

    // ── Session invalidation on password change ─────────────────────────────
    // If the user has changed their password after this token was issued,
    // reject the token — this logs out all other devices automatically.
    if (user.passwordChangedAt) {
      // JWT iat is in seconds, passwordChangedAt is a Date (milliseconds)
      // Add a 1-second buffer to avoid edge cases where both happen simultaneously
      const passwordChangedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (decoded.iat < passwordChangedTimestamp - 1) {
        return res.status(401).json({
          message: "Your password was recently changed. Please sign in again.",
          code: "PASSWORD_CHANGED",
        });
      }
    }

    req.user = {
      _id:        user._id,
      id:         user._id.toString(),
      pseudonym:  user.pseudonym,
      email:      user.email,
      role:       user.role,
      isBanned:   user.isBanned,
      sessionId:  decoded.sessionId || null,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin" && req.user?.role !== "moderator") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};
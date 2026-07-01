/**
 * middleware/validators.js
 *
 * Lightweight, dependency-free input validation for security-sensitive
 * routes. No new npm package needed — just clear, reusable validators
 * applied as middleware.
 *
 * Usage in route files:
 *   const { validateEmail, validatePin } = require("../middleware/validators");
 *   router.post("/login", validateEmail, validatePin, loginController);
 */

const EMAIL_REGEX     = /^\S+@\S+\.\S+$/;
const PIN_REGEX       = /^\d{6}$/;
const PSEUDONYM_REGEX = /^[a-zA-Z0-9_]{3,20}$/;   // letters, numbers, underscore only

function badRequest(res, message) {
  return res.status(400).json({ message });
}

// ── Email ──────────────────────────────────────────────────────────────────────

function validateEmail(req, res, next) {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    return badRequest(res, "A valid email is required.");
  }
  if (email.length > 254) {
    return badRequest(res, "Email is too long.");
  }
  if (!EMAIL_REGEX.test(email)) {
    return badRequest(res, "Please enter a valid email address.");
  }
  next();
}

// ── PIN (6 digits) ────────────────────────────────────────────────────────────

function validatePin(req, res, next) {
  const pin = req.body.pin || req.body.newPin || req.body.currentPin;
  if (pin !== undefined && typeof pin !== "string" && typeof pin !== "number") {
    return badRequest(res, "PIN must be a 6-digit number.");
  }
  if (pin !== undefined && !PIN_REGEX.test(String(pin))) {
    return badRequest(res, "PIN must be exactly 6 digits.");
  }
  next();
}

// ── Pseudonym ──────────────────────────────────────────────────────────────────

function validatePseudonym(req, res, next) {
  const { pseudonym } = req.body;
  if (!pseudonym || typeof pseudonym !== "string") {
    return badRequest(res, "A valid pseudonym is required.");
  }
  if (!PSEUDONYM_REGEX.test(pseudonym.trim())) {
    return badRequest(res, "Pseudonym must be 3-20 characters, letters, numbers, or underscores only.");
  }
  next();
}

// ── Generic string field with length cap (prevents oversized payloads) ────────

function validateStringField(fieldName, { required = false, maxLength = 1000, minLength = 0 } = {}) {
  return (req, res, next) => {
    const value = req.body[fieldName];

    if (required && (!value || typeof value !== "string")) {
      return badRequest(res, `${fieldName} is required.`);
    }
    if (value !== undefined) {
      if (typeof value !== "string") {
        return badRequest(res, `${fieldName} must be text.`);
      }
      if (value.length > maxLength) {
        return badRequest(res, `${fieldName} cannot exceed ${maxLength} characters.`);
      }
      if (value.trim().length < minLength) {
        return badRequest(res, `${fieldName} must be at least ${minLength} characters.`);
      }
    }
    next();
  };
}

// ── Reject oversized JSON payloads generically (defense in depth) ─────────────
// Note: express.json({ limit: "..." }) in server.js is the primary defense;
// this is a secondary check for specific known text fields.

module.exports = {
  validateEmail,
  validatePin,
  validatePseudonym,
  validateStringField,
};
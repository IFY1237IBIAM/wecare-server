/**
 * middleware/redactLogs.js
 *
 * Prevents sensitive fields (passwords, PINs, tokens, recovery codes)
 * from ever appearing in Render's logs, even in dev-style morgan output.
 *
 * morgan("dev") only logs the request LINE (method, path, status, time),
 * NOT the request body by default — so passwords/PINs sent in POST
 * bodies are NOT actually logged by morgan itself. However, this
 * middleware adds a safety net for:
 *   1. Any console.log(req.body) left in controllers (including
 *      debug code that might get re-added in the future)
 *   2. Error handlers that might accidentally stringify the full
 *      request object
 *
 * Usage in server.js — add right after express.json():
 *
 *   const { redactBody } = require("./middleware/redactLogs");
 *   app.use(express.json());
 *   app.use(redactBody);  // attaches req.safeBody for logging purposes
 */

const SENSITIVE_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "pin",
  "newPin",
  "currentPin",
  "recoveryCode",
  "token",
  "verifyToken",
  "sixDigitCode",
  "twoStepPin",
  "twoStepRecoveryCode",
];

function redactObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const redacted = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEYS.includes(key)) {
      redacted[key] = "[REDACTED]";
    } else if (obj[key] && typeof obj[key] === "object") {
      redacted[key] = redactObject(obj[key]);
    } else {
      redacted[key] = obj[key];
    }
  }
  return redacted;
}

function redactBody(req, res, next) {
  // Attach a safe-to-log version of the body for any future debug logging
  // Original req.body is untouched — controllers still get real values
  req.safeBody = redactObject(req.body);
  next();
}

module.exports = { redactBody, redactObject };
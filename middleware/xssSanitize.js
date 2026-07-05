/**
 * middleware/xssSanitize.js
 *
 * Strips HTML tags and dangerous patterns from user-submitted text fields
 * before they reach controllers or get stored in MongoDB.
 *
 * Your Post model uses plain text only (confirmed from Post.js):
 *   - post.content (500 chars)
 *   - comment.text (200 chars)
 *   - reply.text (200 chars)
 *   - hashtags (array of strings)
 *   - bio (100 chars)
 *   - pseudonym (stored from User)
 *
 * Since none of these fields are meant to contain HTML, we can
 * aggressively strip ALL HTML tags and dangerous patterns.
 * No need for a permissive sanitizer like DOMPurify — just strip everything.
 *
 * No new npm package needed — pure regex, zero dependencies.
 */

// ── Sanitize a single string value ────────────────────────────────────────────
function sanitizeString(str) {
  if (typeof str !== "string") return str;

  return str
    // Strip all HTML tags: <script>, <img>, <a href="">, etc.
    .replace(/<[^>]*>/g, "")
    // Strip javascript: protocol (works even without a tag)
    .replace(/javascript\s*:/gi, "")
    // Strip data: URIs (can be used for XSS in some contexts)
    .replace(/data\s*:/gi, "")
    // Strip on* event handlers even if they somehow survive tag stripping
    .replace(/\bon\w+\s*=/gi, "")
    // Trim whitespace
    .trim();
}

// ── Recursively sanitize an object's string values ────────────────────────────
function deepSanitizeXss(obj) {
  if (typeof obj === "string") return sanitizeString(obj);
  if (Array.isArray(obj))      return obj.map(deepSanitizeXss);
  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    const cleaned = {};
    for (const key of Object.keys(obj)) {
      cleaned[key] = deepSanitizeXss(obj[key]);
    }
    return cleaned;
  }
  return obj;
}

// ── Middleware ─────────────────────────────────────────────────────────────────
module.exports = function xssSanitize(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = deepSanitizeXss(req.body);
  }
  next();
};
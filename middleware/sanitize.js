/**
 * middleware/sanitize.js
 *
 * Protects against NoSQL injection by stripping any keys starting
 * with "$" or containing "." from req.body, req.query, and req.params
 * BEFORE they ever reach a controller or Mongoose query.
 *
 * Why this matters:
 * Mongoose query operators like $gt, $ne, $where, $regex are valid
 * JSON keys. If a client sends:
 *   { "email": { "$ne": null }, "password": { "$ne": null } }
 * instead of plain strings, and a route does something like:
 *   User.findOne({ email: req.body.email })
 * MongoDB will interpret $ne as an operator instead of a literal
 * value, potentially matching ANY document — a classic NoSQL
 * injection bypassing authentication entirely.
 *
 * This middleware recursively walks the request body/query/params
 * and removes any dangerous keys before your route handlers ever
 * see them.
 *
 * Usage in server.js — add this EARLY, right after express.json():
 *
 *   const sanitize = require("./middleware/sanitize");
 *   app.use(express.json());
 *   app.use(sanitize);
 */

function isDangerousKey(key) {
  return key.startsWith("$") || key.includes(".");
}

function deepSanitize(obj) {
  if (Array.isArray(obj)) {
    return obj.map(deepSanitize);
  }

  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    const cleaned = {};
    for (const key of Object.keys(obj)) {
      if (isDangerousKey(key)) {
        // Skip this key entirely — it's a potential injection attempt
        continue;
      }
      cleaned[key] = deepSanitize(obj[key]);
    }
    return cleaned;
  }

  // Primitives (string, number, boolean, null, undefined) pass through unchanged
  return obj;
}

module.exports = function sanitize(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = deepSanitize(req.body);
  }
  if (req.query && typeof req.query === "object") {
    // req.query is sometimes read-only depending on Express version,
    // so we mutate keys in place rather than reassigning
    const cleanedQuery = deepSanitize(req.query);
    for (const key of Object.keys(req.query)) {
      if (!(key in cleanedQuery)) delete req.query[key];
    }
    Object.assign(req.query, cleanedQuery);
  }
  if (req.params && typeof req.params === "object") {
    req.params = deepSanitize(req.params);
  }
  next();
};
/**
 * routes/postPreviewRoutes.js
 *
 * Serves a dynamic HTML preview page for shared posts.
 * Injects real post content into Open Graph tags so link previews
 * in WhatsApp/iMessage/Telegram/etc. show the actual post, not generic text.
 *
 * Mount in server.js BEFORE the WEB FALLBACK static/catch-all section,
 * so this dynamic route handles /post/:postId instead of the static file.
 */
const express = require("express");
const router = express.Router();
const Post = require("../models/Post");

// Basic HTML-escaping so post content can never break out of attribute/tag context (XSS safety)
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Trim long post content down to a preview-friendly length
function truncate(str = "", max = 160) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

router.get("/post/:postId", async (req, res) => {
  const { postId } = req.params;

  let post = null;
  try {
    post = await Post.findOne({ _id: postId, flagged: { $ne: true } }).lean();
  } catch (e) {
    // Invalid ObjectId format, DB error, etc. — fall through to generic page below
  }

  const title = post
    ? `${escapeHtml(truncate(post.content, 60))} — ${escapeHtml(post.pseudonym || "Anonymous")} on HushCircle`
    : "HushCircle — A safe space for your heart 💜";

  const description = post
    ? escapeHtml(truncate(post.content, 160))
    : "Anonymous, supportive, real. Join HushCircle today.";

  const previewText = post
    ? escapeHtml(post.content)
    : "Someone shared a heartfelt post with you.";

  const showPreview = !!post;

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="HushCircle" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="https://hushcircle.org/og-image.png" />
  <meta property="og:url" content="https://hushcircle.org/post/${escapeHtml(postId)}" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="https://hushcircle.org/og-image.png" />

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0F0A1E;
      color: #EDE8F5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }
    .card {
      background: #1A1330;
      border: 1px solid #2D2450;
      border-radius: 24px;
      padding: 40px 32px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    }
    .logo-wrap {
      width: 72px; height: 72px;
      background: linear-gradient(135deg, #9B6FD4, #C4A3E8);
      border-radius: 22px;
      display: flex; align-items: center; justify-content: center;
      font-size: 36px;
      margin: 0 auto 20px;
      box-shadow: 0 8px 24px rgba(155,111,212,0.4);
    }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .tagline { font-size: 15px; color: #8B7FA8; margin-bottom: 32px; line-height: 1.5; }
    .post-preview {
      background: #0F0A1E;
      border: 1px solid #2D2450;
      border-left: 4px solid #9B6FD4;
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 28px;
      text-align: left;
      display: ${showPreview ? "block" : "none"};
    }
    .btn-primary {
      display: block; width: 100%; padding: 16px; background: #9B6FD4; color: #fff;
      font-size: 16px; font-weight: 700; border: none; border-radius: 14px;
      margin-bottom: 12px; cursor: pointer;
    }
    .btn-secondary {
      display: block; width: 100%; padding: 14px; background: transparent;
      color: #8B7FA8; font-size: 14px; font-weight: 500; border: 1px solid #2D2450;
      border-radius: 14px; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-wrap">💜</div>
    <h1>HushCircle</h1>
    <p class="tagline">A safe space for your heart.<br>Anonymous, supportive, real.</p>

    <div class="post-preview" id="postPreview">
      <p style="font-size:13px;color:#9B6FD4;margin-bottom:8px;">💜 SHARED POST</p>
      <p id="previewText" style="color:#C4A3E8;font-style:italic;">${previewText}</p>
    </div>

    <button class="btn-primary" onclick="openApp()">Open in HushCircle</button>
    <button class="btn-secondary" onclick="goToStore()">Download HushCircle</button>
  </div>

  <script>
    const postId = ${JSON.stringify(postId)};

    function openApp() {
      const deepLink = postId ? \`hushcircle://post/\${postId}\` : 'hushcircle://';
      window.location.href = deepLink;
      setTimeout(() => { goToStore(); }, 2000);
    }

    function goToStore() {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        window.location.href = "https://apps.apple.com/app/hushcircle";
      } else {
        window.location.href = "https://play.google.com/store/apps/details?id=com.hushcircle.app";
      }
    }

    if (postId && /Android|iPhone/i.test(navigator.userAgent)) {
      setTimeout(openApp, 800);
    }
  </script>
</body>
</html>`);
});

module.exports = router;
const { Resend } = require("resend");
const dns = require("dns").promises;
const crypto = require("crypto");

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "HushCircle <noreply@hushcircle.org>";
const REPLY_TO = "support@hushcircle.org";
const APP_URL = process.env.APP_URL || "https://hushcircle.org";

// ─── Helpers ────────────────────────────────────────────────────────────────
function generateSixDigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function validateEmailDeliverable(email) {
  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, message: "Please use a valid email address." };
  }

  const domain = email.split("@")[1];
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) {
      return { valid: false, message: "Please use a valid email address." };
    }
    return { valid: true };
  } catch {
    return { valid: false, message: "Please use a valid email address." };
  }
}

// ─── Shared Template Shell ───────────────────────────────────────────────────
function emailShell({ title, preheader, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0F0A1E;font-family:'Segoe UI',Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0F0A1E;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="font-size:48px;line-height:1;">💜</div>
              <div style="font-size:28px;font-weight:700;color:#EDE8F5;letter-spacing:1px;margin-top:8px;">HushCircle</div>
              <div style="font-size:13px;color:#8B7FA8;margin-top:4px;">A safe space for your heart</div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#1A1330;border-radius:16px;border:1px solid #2D2450;padding:40px 36px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:#8B7FA8;line-height:1.6;">
                Questions? Reply to this email or contact
                <a href="mailto:support@hushcircle.org" style="color:#9B6FD4;text-decoration:none;">support@hushcircle.org</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#4A4260;">
                HushCircle · Your identity is always protected
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
 
function ctaButton(href, label) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr>
      <td align="center">
        <a href="${href}"
           style="display:inline-block;background-color:#9B6FD4;color:#ffffff;font-size:15px;
                  font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;
                  letter-spacing:0.3px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}
 
function codeBlock(code) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <div style="display:inline-block;background-color:#0F0A1E;border:1px solid #2D2450;
                    border-radius:12px;padding:18px 40px;">
          <span style="font-size:32px;font-weight:700;letter-spacing:10px;color:#C4A3E8;
                       font-family:'Courier New',monospace;">${code}</span>
        </div>
      </td>
    </tr>
  </table>`;
}
 
// ─── 1. Welcome + Email Verification ────────────────────────────────────────
async function sendWelcomeEmail({ to, pseudonym, verifyToken, sixDigitCode }) {
  if (process.env.NODE_ENV === "production") {
    console.log(`[DEV] Welcome email skipped for ${to} | code: ${sixDigitCode} | token: ${verifyToken}`);
    return { skipped: true };
  }
 
  const verifyUrl = `${APP_URL}/verify-email?token=${verifyToken}`;
 
  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      Welcome to HushCircle, ${pseudonym} 💜
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#C4A3E8;line-height:1.5;">
      You're now part of a safe, anonymous space to share what's on your heart — without judgment.
    </p>
    <p style="margin:0 0 6px;font-size:14px;color:#8B7FA8;line-height:1.6;">
      Before you dive in, please verify your email address. This keeps your account secure
      and ensures you can recover it if you ever need to.
    </p>
    ${ctaButton(verifyUrl, "Verify My Email")}
    <p style="margin:0 0 6px;font-size:13px;color:#8B7FA8;text-align:center;">
      Or enter this code manually in the app:
    </p>
    ${codeBlock(sixDigitCode)}
    <p style="margin:0;font-size:12px;color:#4A4260;text-align:center;">
      This code and link expire in <strong style="color:#8B7FA8;">15 minutes</strong>.
    </p>
    <hr style="border:none;border-top:1px solid #2D2450;margin:32px 0;" />
    <p style="margin:0;font-size:13px;color:#8B7FA8;line-height:1.6;">
      If you didn't create this account, you can safely ignore this email.
      Nobody else can access your account without your password.
    </p>
  `;
 
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: `${pseudonym}, verify your HushCircle email 💜`,
    html: emailShell({
      title: "Verify your HushCircle email",
      preheader: `Welcome ${pseudonym}! Verify your email to unlock your safe space.`,
      bodyHtml,
    }),
  });
 
  if (error) throw new Error(`Resend error (welcome): ${error.message}`);
  return data;
}
 
// ─── 2. Password Reset ───────────────────────────────────────────────────────
async function sendPasswordResetEmail({ to, pseudonym, sixDigitCode }) {
  if (process.env.NODE_ENV === "production") {
    console.log(`[DEV] Password reset email skipped for ${to} | code: ${sixDigitCode}`);
    return { skipped: true };
  }
 
  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      Reset your password
    </h1>
    <p style="margin:0 0 20px;font-size:14px;color:#8B7FA8;line-height:1.6;">
      We received a request to reset the password for your HushCircle account
      (<strong style="color:#C4A3E8;">${pseudonym}</strong>).
      Use the code below to complete your reset.
    </p>
    ${codeBlock(sixDigitCode)}
    <p style="margin:0 0 24px;font-size:13px;color:#8B7FA8;text-align:center;line-height:1.6;">
      ⏱ This code expires in <strong style="color:#D4A0F0;">10 minutes</strong>.
      Do not share it with anyone.
    </p>
    <hr style="border:none;border-top:1px solid #2D2450;margin:28px 0;" />
    <p style="margin:0;font-size:13px;color:#4A4260;line-height:1.6;">
      If you didn't request this, no action is needed — your password has not been changed.
      If you're concerned about your account, reply to this email and our support team will help.
    </p>
  `;
 
  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    replyTo: REPLY_TO,
    subject: "Your HushCircle password reset code",
    html: emailShell({
      title: "Reset your HushCircle password",
      preheader: "Your password reset code — expires in 10 minutes.",
      bodyHtml,
    }),
  });
 
  if (error) throw new Error(`Resend error (reset): ${error.message}`);
  return data;
}

// ─── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  generateSixDigitCode,
  generateSecureToken,
  validateEmailDeliverable,
  sendWelcomeEmail,
  sendPasswordResetEmail
};
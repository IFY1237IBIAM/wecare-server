/**
 * utils/email.js — Complete production version
 *
 * Added security notification emails:
 *   sendTwoStepEnabledEmail
 *   sendTwoStepDisabledEmail
 *   sendPinChangedEmail
 *   sendPasskeyRegisteredEmail
 *   sendPasskeyDeletedEmail
 *
 * Everything else is unchanged from your original file.
 */

const { Resend } = require("resend");
const dns    = require("dns").promises;
const crypto = require("crypto");

let _resend = null;
const getResend = () => {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set in your .env file.");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
};

const FROM     = "HushCircle <noreply@hushcircle.org>";
const REPLY_TO = "support@hushcircle.org";
const SUPPORT  = "support@hushcircle.org";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Shared Template Shell ─────────────────────────────────────────────────────

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
              
              <img
                src="https://hushcircle.org/assets/adaptive-icon.png"
                alt="HushCircle"
                width="72"
                height="72"
                style="display:block;margin:0 auto 16px;border-radius:16px;"
              />

              <div style="font-size:28px;font-weight:700;color:#EDE8F5;letter-spacing:1px;">
                HushCircle
              </div>

              <div style="font-size:13px;color:#8B7FA8;margin-top:4px;">
                A safe space for your heart
              </div>

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
                <a href="mailto:${SUPPORT}" style="color:#9B6FD4;text-decoration:none;">${SUPPORT}</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#4A4260;">
                HushCircle &middot; Your identity is always protected
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
// ─── Shared Components ────────────────────────────────────────────────────────

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

// Benefit row — icon + title + description
function benefitRow(emoji, title, description) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
    <tr>
      <td width="40" valign="top" style="padding-top:2px;">
        <span style="font-size:22px;">${emoji}</span>
      </td>
      <td valign="top">
        <div style="font-size:14px;font-weight:700;color:#EDE8F5;margin-bottom:3px;">${title}</div>
        <div style="font-size:13px;color:#8B7FA8;line-height:1.6;">${description}</div>
      </td>
    </tr>
  </table>`;
}

// Info box — purple tinted
function infoBox(titleText, contentHtml) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:24px 0;background-color:#0F0A1E;border-radius:12px;border:1px solid #2D2450;">
    <tr>
      <td style="padding:18px 22px;">
        <div style="font-size:11px;font-weight:700;color:#9B6FD4;letter-spacing:0.8px;
                    text-transform:uppercase;margin-bottom:10px;">${titleText}</div>
        <div style="font-size:13px;color:#8B7FA8;line-height:1.7;">${contentHtml}</div>
      </td>
    </tr>
  </table>`;
}

// Warning box — red tinted — "not you?" alert
function warningBox(contentHtml) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:20px 0;background-color:#D4607A18;border-radius:12px;border:1px solid #D4607A44;">
    <tr>
      <td style="padding:16px 20px;">
        <div style="font-size:13px;color:#D4607A;line-height:1.7;">${contentHtml}</div>
      </td>
    </tr>
  </table>`;
}

// Section label
function sectionLabel(text) {
  return `<div style="font-size:11px;font-weight:700;color:#8B7FA8;letter-spacing:1px;
                      text-transform:uppercase;margin:24px 0 14px;">${text}</div>`;
}

// Divider
const divider = `<hr style="border:none;border-top:1px solid #2D2450;margin:28px 0;" />`;

// Timestamp badge
function timestampBadge(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const formatted = d.toUTCString();
  return `
  <div style="text-align:center;margin-top:6px;">
    <span style="display:inline-block;background-color:#9B6FD418;border:1px solid #9B6FD433;
                 border-radius:8px;padding:4px 14px;font-size:12px;color:#C4A3E8;">
      ${formatted}
    </span>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Welcome + Email Verification (UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────

async function sendWelcomeEmail({ to, pseudonym, verifyToken, verifyLink, sixDigitCode }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] Welcome email skipped for ${to} | code: ${sixDigitCode} | token: ${verifyToken}`);
    return { skipped: true };
  }

  const url = verifyLink || `hushcircle://verify-email?token=${verifyToken}`;

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      Welcome to HushCircle, ${pseudonym} &#x1F49C;
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:#C4A3E8;line-height:1.5;">
      You're now part of a safe, anonymous space to share what's on your heart &mdash; without judgment.
    </p>
    <p style="margin:0 0 6px;font-size:14px;color:#8B7FA8;line-height:1.6;">
      Before you dive in, please verify your email address. This keeps your account secure
      and ensures you can recover it if you ever need to.
    </p>
    ${ctaButton(url, "Verify My Email")}
    <p style="margin:0 0 6px;font-size:13px;color:#8B7FA8;text-align:center;">
      Or enter this code manually in the app:
    </p>
    ${codeBlock(sixDigitCode)}
    <p style="margin:0;font-size:12px;color:#4A4260;text-align:center;">
      This code and link expire in <strong style="color:#8B7FA8;">15 minutes</strong>.
    </p>
    ${divider}
    <p style="margin:0;font-size:13px;color:#8B7FA8;line-height:1.6;">
      If you didn't create this account, you can safely ignore this email.
      Nobody else can access your account without your password.
    </p>
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: `${pseudonym}, verify your HushCircle email &#x1F49C;`,
    html:    emailShell({
      title:     "Verify your HushCircle email",
      preheader: `Welcome ${pseudonym}! Verify your email to unlock your safe space.`,
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (welcome): ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Password Reset (UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────

async function sendPasswordResetEmail({ to, pseudonym, sixDigitCode }) {
  if (process.env.NODE_ENV === "development") {
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
      &#x23F1; This code expires in <strong style="color:#D4A0F0;">10 minutes</strong>.
      Do not share it with anyone.
    </p>
    ${divider}
    <p style="margin:0;font-size:13px;color:#4A4260;line-height:1.6;">
      If you didn't request this, no action is needed &mdash; your password has not been changed.
      If you're concerned about your account, reply to this email and our support team will help.
    </p>
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: "Your HushCircle password reset code",
    html:    emailShell({
      title:     "Reset your HushCircle password",
      preheader: "Your password reset code &mdash; expires in 10 minutes.",
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (reset): ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Two-Step Verification ENABLED
// ─────────────────────────────────────────────────────────────────────────────

async function sendTwoStepEnabledEmail({ to, pseudonym }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] Two-step enabled email skipped for ${to}`);
    return { skipped: true };
  }

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      Two-step verification is now ON
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#C4A3E8;line-height:1.6;">
      Hi ${pseudonym}, you've successfully enabled two-step verification on your HushCircle account.
      Your account is now significantly more secure.
    </p>

    ${sectionLabel("What two-step verification does for you")}

    ${benefitRow("&#x1F510;", "Blocks unauthorised sign-ins",
      "Even if someone knows your password, they cannot access your account without your 6-digit PIN. Your password alone is no longer enough.")}
    ${benefitRow("&#x1F6E1;&#xFE0F;", "Protects your private content",
      "Everything you share on HushCircle stays private. Two-step ensures only you can access your posts, check-ins, and circles.")}
    ${benefitRow("&#x1F4F1;", "New device protection",
      "Any time someone tries to sign in to your account on a new device, your PIN is required &mdash; just like WhatsApp and Telegram.")}
    ${benefitRow("&#x1F511;", "Recovery code is your backup",
      "If you ever forget your PIN, use the one-time recovery code you saved when you set this up. Store it in a password manager or somewhere safe offline.")}

    ${infoBox("Important reminders",
      "&#x2022; Never share your PIN with anyone &mdash; including HushCircle support.<br/>" +
      "&#x2022; Your recovery code can only be used once. Keep it safe.<br/>" +
      "&#x2022; You can change or disable two-step anytime in <strong style='color:#C4A3E8;'>Settings &rarr; Security</strong>."
    )}

    ${warningBox(
      "<strong>Not you?</strong> If you did not enable two-step verification, your account may be compromised. " +
      "Change your password immediately and contact us at " +
      `<a href="mailto:${SUPPORT}" style="color:#D4607A;">${SUPPORT}</a>.`
    )}

    <p style="margin:0;font-size:13px;color:#8B7FA8;text-align:center;line-height:1.6;">
      Two-step verification was enabled on your account.
    </p>
    ${timestampBadge()}
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: "Two-step verification enabled on your HushCircle account",
    html:    emailShell({
      title:     "Two-step verification enabled",
      preheader: "Your HushCircle account is now protected with two-step verification.",
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (two-step enabled): ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Two-Step Verification DISABLED
// ─────────────────────────────────────────────────────────────────────────────

async function sendTwoStepDisabledEmail({ to, pseudonym }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] Two-step disabled email skipped for ${to}`);
    return { skipped: true };
  }

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      Two-step verification has been turned off
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#C4A3E8;line-height:1.6;">
      Hi ${pseudonym}, two-step verification has been <strong>disabled</strong> on your HushCircle account.
      You can re-enable it anytime in Settings &rarr; Security.
    </p>

    ${sectionLabel("What this means for your account")}

    ${benefitRow("&#x26A0;&#xFE0F;", "Only your password protects your account",
      "Without two-step verification, anyone who knows your password can sign in to your account. We strongly recommend re-enabling it as soon as possible.")}
    ${benefitRow("&#x1F511;", "Consider enabling a passkey instead",
      "A passkey lets you sign in with your fingerprint or face &mdash; no password needed and nothing to forget. Set one up in Settings &rarr; Security &rarr; Passkeys.")}
    ${benefitRow("&#x1F49C;", "Re-enable anytime",
      "Changed your mind? Open the HushCircle app, go to Settings &rarr; Security, and tap &ldquo;Enable two-step verification&rdquo; to set a new PIN instantly.")}

    ${warningBox(
      "<strong>Not you?</strong> If you did not disable two-step verification, your account may be compromised. " +
      "Change your password immediately and contact us at " +
      `<a href="mailto:${SUPPORT}" style="color:#D4607A;">${SUPPORT}</a>.`
    )}

    <p style="margin:0;font-size:13px;color:#8B7FA8;text-align:center;line-height:1.6;">
      Two-step verification was disabled on your account.
    </p>
    ${timestampBadge()}
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: "Two-step verification has been turned off on your HushCircle account",
    html:    emailShell({
      title:     "Two-step verification disabled",
      preheader: "Two-step verification was turned off on your HushCircle account.",
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (two-step disabled): ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Two-Step PIN CHANGED
// ─────────────────────────────────────────────────────────────────────────────

async function sendPinChangedEmail({ to, pseudonym }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] PIN changed email skipped for ${to}`);
    return { skipped: true };
  }

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      Your two-step PIN has been changed
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#C4A3E8;line-height:1.6;">
      Hi ${pseudonym}, your two-step verification PIN was successfully updated.
      Your new PIN is now active for all future sign-ins on new devices.
    </p>

    ${sectionLabel("What you should do now")}

    ${benefitRow("&#x1F510;", "Your new PIN is active immediately",
      "The next time you sign in on a new device, your new PIN will be required. Make sure you remember it or store a hint somewhere safe.")}
    ${benefitRow("&#x1F4CB;", "Update your records",
      "If you stored your old PIN in a password manager or notebook, update it now with your new PIN. Your existing recovery code remains valid.")}
    ${benefitRow("&#x1F49C;", "Your recovery code is unchanged",
      "The one-time recovery code you saved when you first enabled two-step verification still works. If you've lost it, disable and re-enable two-step to get a new one.")}

    ${infoBox("Reminder",
      "Never share your PIN with anyone &mdash; including HushCircle support.<br/>" +
      "You can change your PIN again anytime in <strong style='color:#C4A3E8;'>Settings &rarr; Security &rarr; Change PIN</strong>."
    )}

    ${warningBox(
      "<strong>Not you?</strong> If you did not change your PIN, your account may be compromised. " +
      "Disable two-step verification, change your password immediately, and contact us at " +
      `<a href="mailto:${SUPPORT}" style="color:#D4607A;">${SUPPORT}</a>.`
    )}

    <p style="margin:0;font-size:13px;color:#8B7FA8;text-align:center;line-height:1.6;">
      Two-step verification PIN was changed on your account.
    </p>
    ${timestampBadge()}
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: "Your HushCircle two-step PIN has been changed",
    html:    emailShell({
      title:     "Two-step PIN changed",
      preheader: "Your HushCircle two-step verification PIN has been updated.",
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (PIN changed): ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Passkey REGISTERED
// ─────────────────────────────────────────────────────────────────────────────

async function sendPasskeyRegisteredEmail({ to, pseudonym, deviceName, createdAt }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] Passkey registered email skipped for ${to} | device: ${deviceName}`);
    return { skipped: true };
  }

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      New passkey registered &#x1F511;
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#C4A3E8;line-height:1.6;">
      Hi ${pseudonym}, a new passkey has been registered on your HushCircle account.
      You can now sign in using your fingerprint or face &mdash; no password needed.
    </p>

    ${infoBox("Passkey details",
      `<strong style="color:#EDE8F5;">Device:</strong>
       <span style="color:#C4A3E8;">&nbsp;${deviceName || "Your device"}</span><br/>
       <strong style="color:#EDE8F5;">Registered:</strong>
       <span style="color:#C4A3E8;">&nbsp;${new Date(createdAt || Date.now()).toUTCString()}</span>`
    )}

    ${sectionLabel("Why passkeys are more secure than passwords")}

    ${benefitRow("&#x1F511;", "No password to steal",
      "Passkeys use cryptographic key pairs. Your private key never leaves your device and is never sent over the internet. There is nothing for an attacker to steal or guess.")}
    ${benefitRow("&#x1F933;", "Your biometrics stay on your device",
      "HushCircle never receives your fingerprint or face data. Your biometrics only unlock the key locally on your device &mdash; that is it. We see nothing.")}
    ${benefitRow("&#x1F6E1;&#xFE0F;", "Phishing-proof by design",
      "A passkey only works with the real HushCircle app. Even if someone tricks you into visiting a fake site, your passkey cannot be used there.")}
    ${benefitRow("&#x26A1;", "Instant sign-in",
      "Open HushCircle, enter your pseudonym, tap the passkey button, confirm with your fingerprint &mdash; you are in. No typing, no waiting, no forgotten passwords.")}

    ${infoBox("Managing your passkeys",
      "You can view, add, or remove passkeys anytime in<br/>" +
      "<strong style='color:#C4A3E8;'>Settings &rarr; Security &rarr; Passkeys</strong>.<br/><br/>" +
      "If you lose or replace your device, remove its passkey from Security settings " +
      "and register a new one on your new device."
    )}

    ${warningBox(
      "<strong>Not you?</strong> If you did not register this passkey, remove it immediately in " +
      "Settings &rarr; Security &rarr; Passkeys, change your password, and contact us at " +
      `<a href="mailto:${SUPPORT}" style="color:#D4607A;">${SUPPORT}</a>.`
    )}

    <p style="margin:0;font-size:13px;color:#8B7FA8;text-align:center;line-height:1.6;">
      A passkey was registered for <strong style="color:#C4A3E8;">${deviceName || "your device"}</strong>.
    </p>
    ${timestampBadge(createdAt)}
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: "New passkey registered on your HushCircle account",
    html:    emailShell({
      title:     "Passkey registered",
      preheader: `A new passkey was registered for ${deviceName || "your device"} on your HushCircle account.`,
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (passkey registered): ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Passkey DELETED
// ─────────────────────────────────────────────────────────────────────────────

async function sendPasskeyDeletedEmail({ to, pseudonym, deviceName }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] Passkey deleted email skipped for ${to} | device: ${deviceName}`);
    return { skipped: true };
  }

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      Passkey removed from your account
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#C4A3E8;line-height:1.6;">
      Hi ${pseudonym}, the passkey for
      <strong style="color:#EDE8F5;">${deviceName || "a device"}</strong>
      has been removed from your HushCircle account.
    </p>

    ${sectionLabel("What happens next")}

    ${benefitRow("&#x1F4F1;", "That device can no longer use passkey sign-in",
      "If you want passkey sign-in on that device again, open HushCircle on it, go to Settings &rarr; Security, and register a new passkey in seconds.")}
    ${benefitRow("&#x1F510;", "Your account is still secure",
      "You can still sign in with your email and password. If two-step verification is enabled, your PIN is still required on new sign-ins.")}
    ${benefitRow("&#x1F511;", "Register a new passkey anytime",
      "Open HushCircle on any device, go to Settings &rarr; Security &rarr; Passkeys, and tap &ldquo;Create a passkey&rdquo; to set up a new one.")}

    ${warningBox(
      "<strong>Not you?</strong> If you did not remove this passkey, your account may be compromised. " +
      "Change your password immediately and contact us at " +
      `<a href="mailto:${SUPPORT}" style="color:#D4607A;">${SUPPORT}</a>.`
    )}

    <p style="margin:0;font-size:13px;color:#8B7FA8;text-align:center;line-height:1.6;">
      Passkey removed for <strong style="color:#C4A3E8;">${deviceName || "a device"}</strong>.
    </p>
    ${timestampBadge()}
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: "A passkey was removed from your HushCircle account",
    html:    emailShell({
      title:     "Passkey removed",
      preheader: `The passkey for ${deviceName || "a device"} was removed from your HushCircle account.`,
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (passkey deleted): ${error.message}`);
  return data;
}


/**
 * ADDITIONS to utils/email.js
 *
 * Add these 3 functions to your existing utils/email.js file,
 * and add them to the module.exports at the bottom.
 *
 * They use the same emailShell, ctaButton, codeBlock, benefitRow,
 * infoBox, warningBox, sectionLabel, timestampBadge helpers that
 * already exist in your email.js — no new imports needed.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Account Recovery — Request Received
// ─────────────────────────────────────────────────────────────────────────────

async function sendRecoveryRequestReceivedEmail({ to, pseudonym }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] Recovery request received email skipped for ${to}`);
    return { skipped: true };
  }

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      We received your recovery request
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#C4A3E8;line-height:1.6;">
      Hi ${pseudonym}, we've received a request to recover access to your HushCircle account.
      Our team will review it carefully within 24&ndash;48 hours.
    </p>

    ${sectionLabel("What happens next")}

    ${benefitRow("&#x1F4CB;", "We review your details",
      "Our team compares the information you submitted against your account records to confirm it's really you.")}
    ${benefitRow("&#x2705;", "You'll get an email with the outcome",
      "If approved, we'll disable your two-step verification so you can sign in with just your password.")}
    ${benefitRow("&#x1F510;", "Re-enable security afterward",
      "Once you're back in, we recommend setting up two-step verification or a passkey again right away.")}

    ${infoBox("Important",
      "If you did not submit this request, please contact us immediately at " +
      `<a href="mailto:${SUPPORT}" style="color:#C4A3E8;">${SUPPORT}</a>. ` +
      "No changes have been made to your account yet."
    )}

    <p style="margin:0;font-size:13px;color:#8B7FA8;text-align:center;line-height:1.6;">
      Recovery request submitted for your account.
    </p>
    ${timestampBadge()}
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: "We received your HushCircle account recovery request",
    html:    emailShell({
      title:     "Recovery request received",
      preheader: "We're reviewing your account recovery request.",
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (recovery received): ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Recovery — Approved
// ─────────────────────────────────────────────────────────────────────────────

async function sendRecoveryApprovedEmail({ to, pseudonym }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] Recovery approved email skipped for ${to}`);
    return { skipped: true };
  }

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      Your account has been recovered &#x1F49C;
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#C4A3E8;line-height:1.6;">
      Hi ${pseudonym}, good news &mdash; your recovery request was approved.
      Two-step verification has been turned off so you can sign in with just your password.
    </p>

    ${sectionLabel("What to do now")}

    ${benefitRow("&#x1F511;", "Sign in with your password",
      "If you remember your password, just sign in normally. If not, use 'Forgot password' on the sign-in screen to set a new one.")}
    ${benefitRow("&#x1F510;", "Set up security again",
      "Once you're signed in, we strongly recommend enabling two-step verification or a passkey again, and saving your recovery code somewhere safe this time.")}

    ${warningBox(
      "<strong>Didn't request this?</strong> If you believe your account was recovered without your permission, " +
      `contact us immediately at <a href="mailto:${SUPPORT}" style="color:#D4607A;">${SUPPORT}</a>.`
    )}

    <p style="margin:0;font-size:13px;color:#8B7FA8;text-align:center;line-height:1.6;">
      Account recovery approved. Two-step verification disabled.
    </p>
    ${timestampBadge()}
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: "Your HushCircle account has been recovered",
    html:    emailShell({
      title:     "Account recovered",
      preheader: "Your account recovery request was approved.",
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (recovery approved): ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Recovery — Rejected
// ─────────────────────────────────────────────────────────────────────────────

async function sendRecoveryRejectedEmail({ to, pseudonym }) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] Recovery rejected email skipped for ${to}`);
    return { skipped: true };
  }

  const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#EDE8F5;">
      We couldn't verify your recovery request
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#C4A3E8;line-height:1.6;">
      Hi ${pseudonym}, we were unable to confirm the details in your recent account recovery request.
      For your security, we did not make any changes to the account.
    </p>

    ${sectionLabel("What you can do")}

    ${benefitRow("&#x1F4DD;", "Submit a new request",
      "Try again with more specific details &mdash; your pseudonym, roughly when you joined, and a clear description of your situation helps us verify faster.")}
    ${benefitRow("&#x2709;&#xFE0F;", "Contact support directly",
      `If you're having trouble, reply to this email or reach us at <a href="mailto:${SUPPORT}" style="color:#C4A3E8;">${SUPPORT}</a> and we'll help personally.`)}

    <p style="margin:0;font-size:13px;color:#8B7FA8;text-align:center;line-height:1.6;">
      Account recovery request reviewed &mdash; unable to verify.
    </p>
    ${timestampBadge()}
  `;

  const { data, error } = await getResend().emails.send({
    from:    FROM,
    to,
    replyTo: REPLY_TO,
    subject: "Update on your HushCircle account recovery request",
    html:    emailShell({
      title:     "Recovery request not approved",
      preheader: "We were unable to verify your account recovery request.",
      bodyHtml,
    }),
  });

  if (error) throw new Error(`Resend error (recovery rejected): ${error.message}`);
  return data;
}

/**
 * ADD THESE TO module.exports at the bottom of email.js:
 *
 *   sendRecoveryRequestReceivedEmail,
 *   sendRecoveryApprovedEmail,
 *   sendRecoveryRejectedEmail,
 */
// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Helpers
  generateSixDigitCode,
  generateSecureToken,
  validateEmailDeliverable,
  // Original emails (unchanged)
  sendWelcomeEmail,
  sendPasswordResetEmail,
  // New security emails
  sendTwoStepEnabledEmail,
  sendTwoStepDisabledEmail,
  sendPinChangedEmail,
  sendPasskeyRegisteredEmail,
  sendPasskeyDeletedEmail,
  sendRecoveryRequestReceivedEmail,
  sendRecoveryApprovedEmail,
  sendRecoveryRejectedEmail,
};
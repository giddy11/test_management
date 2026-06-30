// shared/utils/mailer.js
// Transport + the single emailLayout() wrapper + all send functions.
// Email failures are fire-and-forget for callers — they must never throw upstream.
const nodemailer = require("nodemailer");
const { env } = require("../../config/env");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: env.email.user, pass: env.email.password },
  });
  return transporter;
}

// Verifies SMTP credentials/connection without sending anything.
async function verifyTransport() {
  return getTransporter().verify();
}

// ── The single brand wrapper. Only place <html>/<body> tags appear. ────────────
function emailLayout(body) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:22px 40px">
          <span style="font-size:22px;font-weight:800;color:#ffffff">Test<span style="color:#6366f1">Mate</span></span>
        </td></tr>
        <tr><td style="background:#ffffff;padding:40px;border:1px solid #e2e8f0;border-top:none">
          ${body}
        </td></tr>
        <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:18px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">&copy; ${year} TestMate &middot; ${env.email.from.replace(/.*<|>.*/g, "")}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function otpBox(code) {
  return `<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:24px 16px;text-align:center;margin:0 0 24px">
    <span style="font-size:38px;font-weight:800;letter-spacing:12px;color:#0f172a;font-family:'Courier New',Courier,monospace">${code}</span>
  </div>`;
}

async function send({ to, subject, html, text }) {
  if (!env.email.user || !env.email.password) {
    console.warn("[mailer] EMAIL credentials not set — skipping send to", to);
    return;
  }
  return getTransporter().sendMail({ from: env.email.from, to, subject, html, text });
}

// ── Email verification (on registration) ───────────────────────────────────────
async function sendVerificationEmail(to, code, firstName = "there") {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a">Verify your email</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, welcome to TestMate. Use the code below to verify the email address for your organisation account.</p>
    ${otpBox(code)}
    <p style="margin:0 0 0;font-size:13px;color:#9ca3af">This code expires in ${env.otpTtlMinutes} minutes. If you didn't create an account, you can ignore this email.</p>`;
  return send({
    to,
    subject: "Verify your email — TestMate",
    html: emailLayout(body),
    text: `Hi ${firstName}, your TestMate verification code is ${code}. It expires in ${env.otpTtlMinutes} minutes.`,
  });
}

// ── Password reset ─────────────────────────────────────────────────────────────
async function sendPasswordResetEmail(to, code, firstName = "there") {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a">Reset your password</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, use the code below to reset your TestMate password.</p>
    ${otpBox(code)}
    <p style="margin:0 0 0;font-size:13px;color:#9ca3af">This code expires in ${env.otpTtlMinutes} minutes. If you didn't request a reset, your account is still safe — ignore this email.</p>`;
  return send({
    to,
    subject: "Reset your password — TestMate",
    html: emailLayout(body),
    text: `Hi ${firstName}, your TestMate password reset code is ${code}. It expires in ${env.otpTtlMinutes} minutes.`,
  });
}

// ── Event notifications ─────────────────────────────────────────────────────────
function ctaButton(url, label) {
  if (!url) return "";
  return `<div style="text-align:center;margin:24px 0">
    <a href="${url}" style="display:inline-block;background:#6366f1;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:11px 28px;border-radius:8px">${label}</a>
  </div>`;
}

async function sendTestAssignedEmail(to, firstName, caseTitle, assignedByName, url) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You've been assigned a test</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${assignedByName} assigned you to the test case <strong>${caseTitle}</strong>.</p>
    ${ctaButton(url, "View test case")}`;
  return send({
    to,
    subject: "You've been assigned a test — TestMate",
    html: emailLayout(body),
    text: `${assignedByName} assigned you to the test case "${caseTitle}".`,
  });
}

async function sendRunCompletedEmail(to, firstName, runName, summary, url) {
  const line = `${summary.pass ?? 0} passed · ${summary.fail ?? 0} failed · ${summary.blocked ?? 0} blocked · ${summary.skipped ?? 0} skipped`;
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Test run completed</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, the run <strong>${runName}</strong> has been marked completed.</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151">${line}</p>
    ${ctaButton(url, "View run")}`;
  return send({
    to,
    subject: `Run completed — ${runName} — TestMate`,
    html: emailLayout(body),
    text: `The run "${runName}" was completed. ${line}`,
  });
}

// ── Admin-created account welcome ──────────────────────────────────────────────
async function sendWelcomeEmail(to, firstName, password, loginUrl) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a">Welcome to TestMate</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, an admin has created a TestMate account for you. Use the credentials below to sign in.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin:0 0 24px;width:100%">
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px">Email</td></tr>
      <tr><td style="font-size:15px;font-weight:600;color:#0f172a;padding-bottom:14px">${to}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px">Temporary password</td></tr>
      <tr><td style="font-size:15px;font-weight:600;color:#0f172a;font-family:'Courier New',Courier,monospace">${password}</td></tr>
    </table>
    ${ctaButton(loginUrl, "Sign in to TestMate")}
    <p style="margin:0;font-size:13px;color:#9ca3af">Please change your password after your first sign-in.</p>`;
  return send({
    to,
    subject: "Your TestMate account is ready",
    html: emailLayout(body),
    text: `Hi ${firstName}, your TestMate account has been created.\nEmail: ${to}\nTemporary password: ${password}\nSign in at: ${loginUrl}\nPlease change your password after your first sign-in.`,
  });
}

module.exports = {
  emailLayout,
  verifyTransport,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendTestAssignedEmail,
  sendRunCompletedEmail,
};

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

// Renders free-text user input (e.g. an admin's note) safely: escapes HTML so
// the text can't break the layout or inject markup, then turns line breaks
// into <br> so the email keeps the paragraph/line breaks the author typed —
// HTML collapses raw "\n" otherwise, which is what made emails read
// differently from the multi-line textarea it was written in.
function escapeAndLineBreak(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r\n|\r|\n/g, "<br>");
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

// ── External feedback (public form submitters — not TestMate users) ───────────
async function sendFeedbackReceivedEmail(to, name, projectName, title) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">We've received your feedback</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${name}, thanks for reaching out about <strong>${projectName}</strong>. Your feedback <strong>${title}</strong> has been logged with the team.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">We'll email you as it progresses — from review through to resolution.</p>`;
  return send({
    to,
    subject: `Feedback received — ${title} — ${projectName}`,
    html: emailLayout(body),
    text: `Thanks ${name} — your feedback "${title}" about ${projectName} has been logged. We'll email you as it progresses.`,
  });
}

const FEEDBACK_STATUS_LABELS = {
  logged: "Logged",
  acknowledged: "Acknowledged",
  assigned: "Assigned",
  investigating: "Under investigation",
  resolved: "Resolved",
  awaiting_confirmation: "Awaiting your confirmation",
  closed: "Closed",
};

async function sendFeedbackStatusEmail(to, name, projectName, title, status, copy, adminResponse, confirmUrl) {
  const label = FEEDBACK_STATUS_LABELS[status] ?? status;
  const responseBox = adminResponse
    ? `<div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;padding:14px 16px;margin:0 0 24px">
        <p style="margin:0;font-size:14px;color:#374151"><strong>Note from the team:</strong><br>${escapeAndLineBreak(adminResponse)}</p>
      </div>`
    : "";
  // "Awaiting confirmation" is the one stage that needs an action back from the
  // submitter — a link to the confirmation page, not a reply-to-this-email ask.
  const confirmButtons =
    status === "awaiting_confirmation" && confirmUrl
      ? ctaButton(confirmUrl, "Review and confirm")
      : "";
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Update on your feedback</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.65">Hi ${name}, your feedback <strong>${title}</strong> for <strong>${projectName}</strong> is now: <strong>${label}</strong>.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">${copy}</p>
    ${responseBox}
    ${confirmButtons}`;
  return send({
    to,
    subject: `Feedback update — ${title} — ${projectName}`,
    html: emailLayout(body),
    text: `Your feedback "${title}" for ${projectName} is now ${label}. ${copy}${confirmUrl && status === "awaiting_confirmation" ? ` Confirm here: ${confirmUrl}` : ""}`,
  });
}

// Sent after the submitter uses the confirmation link — closes the loop either way.
async function sendFeedbackConfirmationReceivedEmail(to, name, projectName, title, confirmed) {
  const heading = confirmed ? "Thanks for confirming!" : "Thanks — we'll keep investigating";
  const line = confirmed
    ? `Your feedback <strong>${title}</strong> for <strong>${projectName}</strong> has been closed. Thanks for helping us improve!`
    : `We've reopened your feedback <strong>${title}</strong> for <strong>${projectName}</strong> and the team will take another look.`;
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">${heading}</h1>
    <p style="margin:0;font-size:15px;color:#374151;line-height:1.65">Hi ${name}, ${line}</p>`;
  return send({
    to,
    subject: `Feedback ${confirmed ? "closed" : "reopened"} — ${title} — ${projectName}`,
    html: emailLayout(body),
    text: `Hi ${name}, ${confirmed ? `your feedback "${title}" for ${projectName} has been closed. Thanks!` : `we've reopened your feedback "${title}" for ${projectName} and will take another look.`}`,
  });
}

// Internal alert to admins/members when external feedback arrives.
async function sendNewFeedbackAlertEmail(to, firstName, title, typeLabel, projectName, submitterName, url) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New external ${typeLabel}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${submitterName} submitted <strong>${title}</strong> on <strong>${projectName}</strong> through the public feedback form.</p>
    ${ctaButton(url, "Open project")}`;
  return send({
    to,
    subject: `New external ${typeLabel} — ${projectName} — TestMate`,
    html: emailLayout(body),
    text: `${submitterName} submitted "${title}" (${typeLabel}) on ${projectName} via the public feedback form.`,
  });
}

// Internal alert to a project member newly assigned to a feedback item.
async function sendFeedbackAssignedEmail(to, firstName, title, projectName, assignedByName, url) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You've been assigned feedback</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${assignedByName} assigned you to the feedback <strong>${title}</strong> on <strong>${projectName}</strong>.</p>
    ${ctaButton(url, "View feedback")}`;
  return send({
    to,
    subject: `Feedback assigned — ${title} — TestMate`,
    html: emailLayout(body),
    text: `${assignedByName} assigned you to the feedback "${title}" on ${projectName}.`,
  });
}

async function sendProjectMemberAddedEmail(to, firstName, projectName, roleLabel, addedByName, url) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You've been added to a project</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${addedByName} added you to the project <strong>${projectName}</strong> as a <strong>${roleLabel}</strong>.</p>
    ${ctaButton(url, "Open project")}`;
  return send({
    to,
    subject: `You've been added to ${projectName} — TestMate`,
    html: emailLayout(body),
    text: `${addedByName} added you to the project "${projectName}" as a ${roleLabel}.`,
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

// ── Feature requests ────────────────────────────────────────────────────────────
async function sendNewFeatureRequestEmail(to, firstName, title, submittedByName, url) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New feature request</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${submittedByName} submitted a new feature request: <strong>${title}</strong>.</p>
    ${ctaButton(url, "Review request")}`;
  return send({
    to,
    subject: `New feature request — ${title} — TestMate`,
    html: emailLayout(body),
    text: `${submittedByName} submitted a new feature request: "${title}".`,
  });
}

async function sendFeatureRequestStatusEmail(to, firstName, title, status, adminResponse, url, isOwner = true) {
  const label = status.replace(/_/g, " ");
  const responseBox = adminResponse
    ? `<div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;padding:14px 16px;margin:0 0 24px">
        <p style="margin:0;font-size:14px;color:#374151"><strong>Response:</strong><br>${escapeAndLineBreak(adminResponse)}</p>
      </div>`
    : "";
  const heading = isOwner ? "Your feature request was updated" : "Feature request updated";
  const whose = isOwner ? "your request" : "the request";
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">${heading}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${whose} <strong>${title}</strong> is now <strong>${label}</strong>.</p>
    ${responseBox}
    ${ctaButton(url, "View request")}`;
  return send({
    to,
    subject: `Feature request update — ${title} — TestMate`,
    html: emailLayout(body),
    text: `${isOwner ? "Your" : "The"} feature request "${title}" is now ${label}.${adminResponse ? ` Response: ${adminResponse}` : ""}`,
  });
}

async function sendFeatureRequestCommentEmail(to, firstName, title, commenterName, url) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New comment on your feature request</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${commenterName} commented on your feature request <strong>${title}</strong>.</p>
    ${ctaButton(url, "View comment")}`;
  return send({
    to,
    subject: `New comment — ${title} — TestMate`,
    html: emailLayout(body),
    text: `${commenterName} commented on your feature request "${title}".`,
  });
}

// ── Bugs ─────────────────────────────────────────────────────────────────────
async function sendNewBugEmail(to, firstName, title, reportedByName, url) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New bug reported</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${reportedByName} reported a new bug: <strong>${title}</strong>.</p>
    ${ctaButton(url, "Review bug")}`;
  return send({
    to,
    subject: `New bug — ${title} — TestMate`,
    html: emailLayout(body),
    text: `${reportedByName} reported a new bug: "${title}".`,
  });
}

async function sendBugStatusEmail(to, firstName, title, status, url, isOwner = true) {
  const whose = isOwner ? "your bug report" : "the bug";
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Bug status updated</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${whose} <strong>${title}</strong> is now <strong>${status}</strong>.</p>
    ${ctaButton(url, "View bug")}`;
  return send({
    to,
    subject: `Bug update — ${title} — TestMate`,
    html: emailLayout(body),
    text: `${isOwner ? "Your bug report" : "The bug"} "${title}" is now ${status}.`,
  });
}

async function sendBugAssignedEmail(to, firstName, title, url) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You've been assigned a bug</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, you've been assigned to fix <strong>${title}</strong>.</p>
    ${ctaButton(url, "View bug")}`;
  return send({
    to,
    subject: `Bug assigned — ${title} — TestMate`,
    html: emailLayout(body),
    text: `You've been assigned to fix the bug "${title}".`,
  });
}

module.exports = {
  emailLayout,
  verifyTransport,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendTestAssignedEmail,
  sendProjectMemberAddedEmail,
  sendFeedbackReceivedEmail,
  sendFeedbackStatusEmail,
  sendNewFeedbackAlertEmail,
  sendFeedbackAssignedEmail,
  sendFeedbackConfirmationReceivedEmail,
  sendRunCompletedEmail,
  sendNewFeatureRequestEmail,
  sendFeatureRequestStatusEmail,
  sendFeatureRequestCommentEmail,
  sendNewBugEmail,
  sendBugStatusEmail,
  sendBugAssignedEmail,
};

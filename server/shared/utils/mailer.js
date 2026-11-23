// shared/utils/mailer.js
// The single emailLayout() wrapper + all send functions. How a message leaves
// the server (Nodemailer SMTP or Google Apps Script, picked by EMAIL_PROVIDER)
// and the email log it writes live in shared/utils/mail/emailSender.ts, which is
// the one send() every function below goes through. Each passes a `kind` — one of
// EMAIL_KINDS in shared/utils/mail/emailKinds.ts — so the log can say what it was.
// Email failures are fire-and-forget for callers — they must never throw upstream.
const { env } = require("../../config/env");
const { UserRepository } = require("../../modules/user/repositories/user.repository");
const { sendEmail } = require("./mail/emailSender");
const { verifyGmailTransport } = require("./mail/emailTransports");

// Verifies SMTP credentials/connection without sending anything. Gmail only —
// an Apps Script web app has no send-free way to be checked.
async function verifyTransport() {
  return verifyGmailTransport();
}

// ── Footer contact ──────────────────────────────────────────────────────────
// The footer used to show the app's own SMTP sending mailbox. It now shows the
// recipient's organisation's owner (the account that created it — see
// UserRepository.findOrgOwner) so every branded email points to a real,
// stable contact at the company instead of ServiceDesk4u's relay address.
const DEFAULT_FOOTER_EMAIL = env.email.from.replace(/.*<|>.*/g, "");

// Cached per organisationId for the process lifetime — ownership rarely
// changes, and this avoids an extra query per recipient when a single event
// fans out to many users in one organisation (e.g. notifying a whole project).
const footerEmailCache = new Map();

async function resolveFooterEmail(organizationId) {
  if (!organizationId) return DEFAULT_FOOTER_EMAIL;
  if (footerEmailCache.has(organizationId)) return footerEmailCache.get(organizationId);
  let email = DEFAULT_FOOTER_EMAIL;
  try {
    const owner = await UserRepository.Instance.findOrgOwner(organizationId);
    if (owner?.email) email = owner.email;
  } catch (e) {
    console.error("[mailer] org owner lookup failed:", e.message);
  }
  footerEmailCache.set(organizationId, email);
  return email;
}

// ── The single brand wrapper. Only place <html>/<body> tags appear. ────────────
function emailLayout(body, footerEmail = DEFAULT_FOOTER_EMAIL) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr><td style="background:#0f172a;border-radius:12px 12px 0 0;padding:22px 40px">
          <span style="font-size:22px;font-weight:800;color:#ffffff">ServiceDesk<span style="color:#6366f1">4u</span></span>
        </td></tr>
        <tr><td style="background:#ffffff;padding:40px;border:1px solid #e2e8f0;border-top:none">
          ${body}
        </td></tr>
        <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:18px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">&copy; ${year} ServiceDesk4u &middot; ${footerEmail}</p>
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

// The one send(): picks the provider from EMAIL_PROVIDER, sends, and writes the email log
// (see shared/utils/mail/emailSender.ts). Every send*Email below funnels through it.
const send = sendEmail;

// ── Email verification (on registration) ───────────────────────────────────────
async function sendVerificationEmail(to, code, firstName = "there", organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a">Verify your email</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, welcome to ServiceDesk4u. Use the code below to verify the email address for your organisation account.</p>
    ${otpBox(code)}
    <p style="margin:0 0 0;font-size:13px;color:#9ca3af">This code expires in ${env.otpTtlMinutes} minutes. If you didn't create an account, you can ignore this email.</p>`;
  return send({
    to,
    kind: "verification",
    organizationId,
    subject: "Verify your email — ServiceDesk4u",
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `Hi ${firstName}, your ServiceDesk4u verification code is ${code}. It expires in ${env.otpTtlMinutes} minutes.`,
  });
}

// ── Password reset ─────────────────────────────────────────────────────────────
async function sendPasswordResetEmail(to, code, firstName = "there", organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a">Reset your password</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, use the code below to reset your ServiceDesk4u password.</p>
    ${otpBox(code)}
    <p style="margin:0 0 0;font-size:13px;color:#9ca3af">This code expires in ${env.otpTtlMinutes} minutes. If you didn't request a reset, your account is still safe — ignore this email.</p>`;
  return send({
    to,
    kind: "password_reset",
    organizationId,
    subject: "Reset your password — ServiceDesk4u",
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `Hi ${firstName}, your ServiceDesk4u password reset code is ${code}. It expires in ${env.otpTtlMinutes} minutes.`,
  });
}

// ── Ticket lookup (submitter checking their own ticket history, no account) ────
// Formats env.ticketLookupCodeTtlMinutes in whatever unit reads best — this
// TTL is measured in days by default, so "expires in 2880 minutes" would be
// a poor read.
function formatTtl(minutes) {
  if (minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

async function sendTicketLookupCodeEmail(to, code) {
  const ttl = formatTtl(env.ticketLookupCodeTtlMinutes);
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a">Your ticket lookup code</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Use the code below to view every ticket you've raised with us.</p>
    ${otpBox(code)}
    <p style="margin:0 0 0;font-size:13px;color:#9ca3af">This code expires in ${ttl}. If you didn't request this, you can ignore this email.</p>`;
  return send({
    to,
    kind: "ticket_lookup_code",
    subject: "Your ticket lookup code — ServiceDesk4u",
    html: emailLayout(body),
    text: `Your ServiceDesk4u ticket lookup code is ${code}. It expires in ${ttl}.`,
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

async function sendTestAssignedEmail(to, firstName, caseTitle, assignedByName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You've been assigned a test</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${assignedByName} assigned you to the test case <strong>${caseTitle}</strong>.</p>
    ${ctaButton(url, "View test case")}`;
  return send({
    to,
    kind: "test_assigned",
    organizationId,
    subject: "You've been assigned a test — ServiceDesk4u",
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${assignedByName} assigned you to the test case "${caseTitle}".`,
  });
}

// ── External feedback (public form submitters — not ServiceDesk4u users) ───────────
async function sendFeedbackReceivedEmail(to, name, projectName, title, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">We've received your feedback</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${name}, thanks for reaching out about <strong>${projectName}</strong>. Your feedback <strong>${title}</strong> has been logged with the team.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">We'll email you as it progresses — from review through to resolution.</p>`;
  return send({
    to,
    kind: "feedback_received",
    organizationId,
    subject: `Feedback received — ${title} — ${projectName}`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `Thanks ${name} — your feedback "${title}" about ${projectName} has been logged. We'll email you as it progresses.`,
  });
}

const FEEDBACK_STATUS_LABELS = {
  logged: "Logged",
  acknowledged: "Acknowledged",
  assigned: "Assigned",
  investigating: "Under investigation",
  resolved: "Resolved",
  closed: "Closed",
};

async function sendFeedbackStatusEmail(to, name, projectName, title, status, copy, adminResponse, organizationId) {
  const label = FEEDBACK_STATUS_LABELS[status] ?? status;
  const responseBox = adminResponse
    ? `<div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;padding:14px 16px;margin:0 0 24px">
        <p style="margin:0;font-size:14px;color:#374151"><strong>Note from the team:</strong><br>${escapeAndLineBreak(adminResponse)}</p>
      </div>`
    : "";
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Update on your feedback</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.65">Hi ${name}, your feedback <strong>${title}</strong> for <strong>${projectName}</strong> is now: <strong>${label}</strong>.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">${copy}</p>
    ${responseBox}`;
  return send({
    to,
    kind: "feedback_status",
    organizationId,
    subject: `Feedback update — ${title} — ${projectName}`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `Your feedback "${title}" for ${projectName} is now ${label}. ${copy}`,
  });
}

// New message in a ticket's comment thread — sent to whichever side didn't
// write it. `name` covers both a staff member's first name and the external
// submitter's full name (they have no account, so no separate first/last).
async function sendFeedbackCommentEmail(to, name, title, commenterName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New message on your ticket</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${name}, ${commenterName} posted a new message on ticket <strong>${title}</strong>.</p>
    ${ctaButton(url, "View conversation")}`;
  return send({
    to,
    kind: "feedback_comment",
    organizationId,
    subject: `New message — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${commenterName} posted a new message on ticket "${title}".`,
  });
}

// Staff-to-staff only — the submitter has no account and can't be mentioned.
async function sendFeedbackMentionEmail(to, firstName, title, mentionerName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You were mentioned</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${mentionerName} mentioned you in a comment on ticket <strong>${title}</strong>.</p>
    ${ctaButton(url, "View comment")}`;
  return send({
    to,
    kind: "feedback_mention",
    organizationId,
    subject: `You were mentioned — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${mentionerName} mentioned you in a comment on ticket "${title}".`,
  });
}

// Internal alert to admins/members when external feedback arrives.
async function sendNewFeedbackAlertEmail(to, firstName, title, typeLabel, projectName, submitterName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New external ${typeLabel}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${submitterName} submitted <strong>${title}</strong> on <strong>${projectName}</strong> through the public feedback form.</p>
    ${ctaButton(url, "Open project")}`;
  return send({
    to,
    kind: "feedback_new_alert",
    organizationId,
    subject: `New external ${typeLabel} — ${projectName} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${submitterName} submitted "${title}" (${typeLabel}) on ${projectName} via the public feedback form.`,
  });
}

// Internal alert to a project member newly assigned to a feedback item.
async function sendFeedbackAssignedEmail(to, firstName, title, projectName, assignedByName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You've been assigned feedback</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${assignedByName} assigned you to the feedback <strong>${title}</strong> on <strong>${projectName}</strong>.</p>
    ${ctaButton(url, "View feedback")}`;
  return send({
    to,
    kind: "feedback_assigned",
    organizationId,
    subject: `Feedback assigned — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${assignedByName} assigned you to the feedback "${title}" on ${projectName}.`,
  });
}

async function sendProjectMemberAddedEmail(to, firstName, projectName, roleLabel, addedByName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You've been added to a project</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${addedByName} added you to the project <strong>${projectName}</strong> as a <strong>${roleLabel}</strong>.</p>
    ${ctaButton(url, "Open project")}`;
  return send({
    to,
    kind: "project_member_added",
    organizationId,
    subject: `You've been added to ${projectName} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${addedByName} added you to the project "${projectName}" as a ${roleLabel}.`,
  });
}

async function sendRunCompletedEmail(to, firstName, runName, summary, url, organizationId) {
  const line = `${summary.pass ?? 0} passed · ${summary.fail ?? 0} failed · ${summary.blocked ?? 0} blocked · ${summary.skipped ?? 0} skipped`;
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Test run completed</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, the run <strong>${runName}</strong> has been marked completed.</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151">${line}</p>
    ${ctaButton(url, "View run")}`;
  return send({
    to,
    kind: "run_completed",
    organizationId,
    subject: `Run completed — ${runName} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `The run "${runName}" was completed. ${line}`,
  });
}

// ── Admin-created account welcome ──────────────────────────────────────────────
async function sendWelcomeEmail(to, firstName, password, loginUrl, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a">Welcome to ServiceDesk4u</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, an admin has created a ServiceDesk4u account for you. Use the credentials below to sign in.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin:0 0 24px;width:100%">
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px">Email</td></tr>
      <tr><td style="font-size:15px;font-weight:600;color:#0f172a;padding-bottom:14px">${to}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px">Temporary password</td></tr>
      <tr><td style="font-size:15px;font-weight:600;color:#0f172a;font-family:'Courier New',Courier,monospace">${password}</td></tr>
    </table>
    ${ctaButton(loginUrl, "Sign in to ServiceDesk4u")}
    <p style="margin:0;font-size:13px;color:#9ca3af">Please change your password after your first sign-in.</p>`;
  return send({
    to,
    kind: "welcome",
    organizationId,
    subject: "Your ServiceDesk4u account is ready",
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `Hi ${firstName}, your ServiceDesk4u account has been created.\nEmail: ${to}\nTemporary password: ${password}\nSign in at: ${loginUrl}\nPlease change your password after your first sign-in.`,
  });
}

// ── Feature requests ────────────────────────────────────────────────────────────
async function sendNewFeatureRequestEmail(to, firstName, title, submittedByName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New feature request</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${submittedByName} submitted a new feature request: <strong>${title}</strong>.</p>
    ${ctaButton(url, "Review request")}`;
  return send({
    to,
    kind: "feature_request_new",
    organizationId,
    subject: `New feature request — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${submittedByName} submitted a new feature request: "${title}".`,
  });
}

async function sendFeatureRequestStatusEmail(to, firstName, title, status, adminResponse, url, isOwner = true, organizationId) {
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
    kind: "feature_request_status",
    organizationId,
    subject: `Feature request update — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${isOwner ? "Your" : "The"} feature request "${title}" is now ${label}.${adminResponse ? ` Response: ${adminResponse}` : ""}`,
  });
}

async function sendFeatureRequestAssignedEmail(to, firstName, title, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You've been assigned a feature request</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, you've been assigned to <strong>${title}</strong>.</p>
    ${ctaButton(url, "View request")}`;
  return send({
    to,
    kind: "feature_request_assigned",
    organizationId,
    subject: `Feature request assigned — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `You've been assigned to the feature request "${title}".`,
  });
}

async function sendFeatureRequestCommentEmail(to, firstName, title, commenterName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New comment on your feature request</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${commenterName} commented on your feature request <strong>${title}</strong>.</p>
    ${ctaButton(url, "View comment")}`;
  return send({
    to,
    kind: "feature_request_comment",
    organizationId,
    subject: `New comment — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${commenterName} commented on your feature request "${title}".`,
  });
}

async function sendFeatureRequestMentionEmail(to, firstName, title, mentionerName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You were mentioned</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${mentionerName} mentioned you in a comment on the feature request <strong>${title}</strong>.</p>
    ${ctaButton(url, "View comment")}`;
  return send({
    to,
    kind: "feature_request_mention",
    organizationId,
    subject: `You were mentioned — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${mentionerName} mentioned you in a comment on the feature request "${title}".`,
  });
}

// ── Bugs ─────────────────────────────────────────────────────────────────────
async function sendNewBugEmail(to, firstName, title, reportedByName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New bug reported</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${reportedByName} reported a new bug: <strong>${title}</strong>.</p>
    ${ctaButton(url, "Review bug")}`;
  return send({
    to,
    kind: "bug_new",
    organizationId,
    subject: `New bug — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${reportedByName} reported a new bug: "${title}".`,
  });
}

async function sendBugStatusEmail(to, firstName, title, status, url, isOwner = true, organizationId) {
  const whose = isOwner ? "your bug report" : "the bug";
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Bug status updated</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${whose} <strong>${title}</strong> is now <strong>${status}</strong>.</p>
    ${ctaButton(url, "View bug")}`;
  return send({
    to,
    kind: "bug_status",
    organizationId,
    subject: `Bug update — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${isOwner ? "Your bug report" : "The bug"} "${title}" is now ${status}.`,
  });
}

async function sendBugCommentEmail(to, firstName, title, commenterName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New comment on your bug report</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${commenterName} commented on the bug <strong>${title}</strong>.</p>
    ${ctaButton(url, "View comment")}`;
  return send({
    to,
    kind: "bug_comment",
    organizationId,
    subject: `New comment — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${commenterName} commented on the bug "${title}".`,
  });
}

async function sendBugMentionEmail(to, firstName, title, mentionerName, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You were mentioned</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${mentionerName} mentioned you in a comment on the bug <strong>${title}</strong>.</p>
    ${ctaButton(url, "View comment")}`;
  return send({
    to,
    kind: "bug_mention",
    organizationId,
    subject: `You were mentioned — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${mentionerName} mentioned you in a comment on the bug "${title}".`,
  });
}

async function sendBugAssignedEmail(to, firstName, title, url, organizationId) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">You've been assigned a bug</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, you've been assigned to fix <strong>${title}</strong>.</p>
    ${ctaButton(url, "View bug")}`;
  return send({
    to,
    kind: "bug_assigned",
    organizationId,
    subject: `Bug assigned — ${title} — ServiceDesk4u`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `You've been assigned to fix the bug "${title}".`,
  });
}

module.exports = {
  emailLayout,
  verifyTransport,
  // Building blocks for domain mail files (shared/utils/mail/*) — the layout,
  // transport, and helpers stay defined here only.
  send,
  resolveFooterEmail,
  ctaButton,
  escapeAndLineBreak,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTicketLookupCodeEmail,
  sendWelcomeEmail,
  sendTestAssignedEmail,
  sendProjectMemberAddedEmail,
  sendFeedbackReceivedEmail,
  sendFeedbackStatusEmail,
  sendNewFeedbackAlertEmail,
  sendFeedbackAssignedEmail,
  sendFeedbackCommentEmail,
  sendFeedbackMentionEmail,
  sendRunCompletedEmail,
  sendNewFeatureRequestEmail,
  sendFeatureRequestStatusEmail,
  sendFeatureRequestCommentEmail,
  sendFeatureRequestMentionEmail,
  sendFeatureRequestAssignedEmail,
  sendNewBugEmail,
  sendBugStatusEmail,
  sendBugCommentEmail,
  sendBugMentionEmail,
  sendBugAssignedEmail,
};

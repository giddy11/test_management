// shared/utils/mail/support.mail.ts
// Client-company IT support tier emails. Layout/transport/helpers live in
// shared/utils/mailer.js — this file only composes bodies (§22.7 domain split).
const {
  send,
  emailLayout,
  resolveFooterEmail,
  ctaButton,
  escapeAndLineBreak,
} = require("../mailer");

// ── Supporter account created by an org admin ────────────────────────────────
export async function sendSupporterInviteEmail(
  to: string,
  firstName: string,
  companyName: string,
  productName: string,
  password: string,
  loginUrl: string,
  organizationId?: string | null
) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a">Your support account is ready</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, a TestMate support account has been created for you as an IT supporter at <strong>${companyName}</strong>. You'll triage feedback from your users about <strong>${productName}</strong> — resolve what you can locally, and escalate the rest to the product team.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin:0 0 24px;width:100%">
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px">Email</td></tr>
      <tr><td style="font-size:15px;font-weight:600;color:#0f172a;padding-bottom:14px">${to}</td></tr>
      <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px">Temporary password</td></tr>
      <tr><td style="font-size:15px;font-weight:600;color:#0f172a;font-family:'Courier New',Courier,monospace">${password}</td></tr>
    </table>
    ${ctaButton(loginUrl, "Sign in to your support queue")}
    <p style="margin:0;font-size:13px;color:#9ca3af">Please change your password after your first sign-in.</p>`;
  return send({
    to,
    subject: "Your support account is ready — TestMate",
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `Hi ${firstName}, your TestMate support account for ${companyName} (product: ${productName}) has been created.\nEmail: ${to}\nTemporary password: ${password}\nSign in at: ${loginUrl}`,
  });
}

// ── New item lands in a company's IT queue ───────────────────────────────────
export async function sendSupportQueueAlertEmail(
  to: string,
  firstName: string,
  title: string,
  typeLabel: string,
  productName: string,
  submitterName: string,
  url: string,
  organizationId?: string | null
) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">New ${typeLabel} in your support queue</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${submitterName} submitted <strong>${title}</strong> about <strong>${productName}</strong>. It's waiting in your company's support queue — resolve it locally or escalate it to the product team.</p>
    ${ctaButton(url, "Open support queue")}`;
  return send({
    to,
    subject: `New ${typeLabel} in your queue — ${productName} — TestMate`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${submitterName} submitted "${title}" (${typeLabel}) about ${productName}. It's waiting in your support queue.`,
  });
}

// ── IT-tier stage update to the end user (acknowledged/investigating/escalated) ─
export async function sendSupportStatusEmail(
  to: string,
  name: string,
  companyName: string,
  productName: string,
  title: string,
  statusLabel: string,
  copy: string,
  organizationId?: string | null
) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Update on your feedback</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.65">Hi ${name}, your feedback <strong>${title}</strong> about <strong>${productName}</strong> is now: <strong>${statusLabel}</strong>.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">${copy}</p>
    <p style="margin:0;font-size:13px;color:#9ca3af">This update comes from ${companyName}'s IT support team.</p>`;
  return send({
    to,
    subject: `Feedback update — ${title} — ${productName}`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `Hi ${name}, your feedback "${title}" about ${productName} is now ${statusLabel}. ${copy}`,
  });
}

// ── IT support resolved the item locally — closes the loop with the end user ─
export async function sendSupportResolutionEmail(
  to: string,
  name: string,
  companyName: string,
  productName: string,
  title: string,
  note: string,
  organizationId?: string | null
) {
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Your feedback has been resolved</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${name}, the IT support team at <strong>${companyName}</strong> has resolved your feedback <strong>${title}</strong> about <strong>${productName}</strong>.</p>
    <div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;padding:14px 16px;margin:0 0 24px">
      <p style="margin:0;font-size:14px;color:#374151"><strong>Note from support:</strong><br>${escapeAndLineBreak(note)}</p>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af">If this doesn't fix things for you, just reach out to your IT support team.</p>`;
  return send({
    to,
    subject: `Feedback resolved — ${title} — ${productName}`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `Hi ${name}, ${companyName}'s IT support resolved your feedback "${title}" about ${productName}. Note: ${note}`,
  });
}

// ── Escalation alert to the product owner's team ─────────────────────────────
export async function sendFeedbackEscalatedAlertEmail(
  to: string,
  firstName: string,
  title: string,
  typeLabel: string,
  productName: string,
  companyName: string,
  escalatedByName: string,
  severityLabel: string,
  note: string | null,
  url: string,
  organizationId?: string | null
) {
  const noteBox = note
    ? `<div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;padding:14px 16px;margin:0 0 24px">
        <p style="margin:0;font-size:14px;color:#374151"><strong>Note from ${escapeAndLineBreak(escalatedByName)}:</strong><br>${escapeAndLineBreak(note)}</p>
      </div>`
    : "";
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Feedback escalated to your team</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, ${escalatedByName} (IT support at <strong>${companyName}</strong>) escalated the ${typeLabel} <strong>${title}</strong> on <strong>${productName}</strong> — their team couldn't resolve it locally. Severity: <strong>${severityLabel}</strong>.</p>
    ${noteBox}
    ${ctaButton(url, "Open project")}`;
  return send({
    to,
    subject: `Feedback escalated (${severityLabel}) — ${title} — ${productName}`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `${escalatedByName} (IT support at ${companyName}) escalated "${title}" (${typeLabel}) on ${productName}. Severity: ${severityLabel}.${note ? ` Note: ${note}` : ""}`,
  });
}

// ── The product team closed an item this supporter escalated ────────────────
// The true end user never sees product-team stage emails post-escalation — this
// tells the supporter it's done so they know to relay the fix themselves.
export async function sendFeedbackClosedSupporterEmail(
  to: string,
  firstName: string,
  companyName: string,
  productName: string,
  title: string,
  adminResponse: string | null,
  url: string,
  organizationId?: string | null
) {
  const noteBox = adminResponse
    ? `<div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;padding:14px 16px;margin:0 0 24px">
        <p style="margin:0;font-size:14px;color:#374151"><strong>Note from the product team:</strong><br>${escapeAndLineBreak(adminResponse)}</p>
      </div>`
    : "";
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Escalated feedback closed</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${firstName}, the product team closed <strong>${title}</strong> on <strong>${productName}</strong> — the item you escalated from <strong>${companyName}</strong>'s support queue.</p>
    ${noteBox}
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Your end user won't hear about this automatically — let them know it's fixed from your support queue.</p>
    ${ctaButton(url, "Open support queue")}`;
  return send({
    to,
    subject: `Closed — ${title} — ${productName}`,
    html: emailLayout(body, await resolveFooterEmail(organizationId)),
    text: `The product team closed "${title}" on ${productName} — the item you escalated from ${companyName}'s support queue.${adminResponse ? ` Note: ${adminResponse}` : ""} Let your end user know it's fixed from your support queue: ${url}`,
  });
}

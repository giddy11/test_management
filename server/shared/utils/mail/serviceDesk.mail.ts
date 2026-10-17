// shared/utils/mail/serviceDesk.mail.ts
// IT-requests emails. Layout/transport/helpers live in shared/utils/mailer.js
// — this file only composes bodies (§22.7 domain split). One template serves
// every IT-request event: a heading, a sentence, an optional quoted note
// (an approver's comment, IT's closing note) and a button to the request.
const {
  send,
  emailLayout,
  resolveFooterEmail,
  ctaButton,
  escapeAndLineBreak,
} = require("../mailer");

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function sendServiceRequestEmail(opts: {
  to: string;
  firstName: string;
  subject: string;
  heading: string;
  message: string; // plain text; escaped here
  note?: string | null;
  noteLabel?: string;
  url: string;
  ctaLabel: string;
  organizationId?: string | null;
}) {
  const noteBlock = opts.note
    ? `<div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;padding:14px 16px;margin:0 0 16px">
      <p style="margin:0;font-size:14px;color:#374151"><strong>${escape(opts.noteLabel ?? "Note")}:</strong><br>${escapeAndLineBreak(opts.note)}</p>
    </div>`
    : "";
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">${escape(opts.heading)}</h1>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Hi ${escape(opts.firstName || "there")}, ${escape(opts.message)}</p>
    ${noteBlock}
    ${ctaButton(opts.url, opts.ctaLabel)}`;
  return send({
    to: opts.to,
    subject: `${opts.subject} — TestMate`,
    html: emailLayout(body, await resolveFooterEmail(opts.organizationId)),
    text: `Hi ${opts.firstName || "there"}, ${opts.message}${opts.note ? `\n\n${opts.noteLabel ?? "Note"}: ${opts.note}` : ""}\n\n${opts.url}`,
  });
}

// shared/utils/mail/ticket.mail.ts
// Submitter-facing ticket emails. Layout/transport/helpers live in
// shared/utils/mailer.js — this file only composes bodies (§22.7 domain split).
const {
  send,
  emailLayout,
  resolveFooterEmail,
  ctaButton,
  escapeAndLineBreak,
} = require("../mailer");

export interface TranscriptEntry {
  // "You" for the submitter, "Support team" for any staff member — individual
  // staff names stay internal, same as every submitter-facing view.
  author: string;
  fromSubmitter: boolean;
  body: string;
  attachments: { url: string; name: string | null }[];
  createdAt: Date | null;
}

// Shown in the reader's own time zone when the widget sent one (an IANA name
// like "Africa/Lagos"); anything unrecognised falls back to UTC, labelled.
function formatWhen(date: Date | null, timeZone?: string): string {
  if (!date) return "";
  const opts = { dateStyle: "medium", timeStyle: "short" } as const;
  try {
    if (timeZone) return date.toLocaleString("en-GB", { ...opts, timeZone });
  } catch {
    // RangeError — not a real time zone; fall through to UTC.
  }
  return `${date.toLocaleString("en-GB", { ...opts, timeZone: "UTC" })} UTC`;
}

// ── Full conversation transcript, on request ─────────────────────────────────
// The submitter asked for it from the WhatsApp widget's ticket view — the
// original message plus every reply, oldest first.
export async function sendTicketTranscriptEmail(params: {
  to: string;
  name: string;
  ticketLabel: string; // "TKT-20261008-023 — Am trying to access…"
  productName: string;
  statusLabel: string;
  originalMessage: string;
  originalAt: Date;
  entries: TranscriptEntry[];
  url: string;
  timeZone?: string;
  organizationId?: string | null;
}) {
  const { to, name, ticketLabel, productName, statusLabel, originalMessage, originalAt, entries, url, timeZone } =
    params;

  const messageBlock = (author: string, when: string, body: string, fromSubmitter: boolean, extra = "") => `
    <div style="margin:0 0 12px;padding:12px 14px;border-radius:8px;background:${fromSubmitter ? "#ecfdf5" : "#f8fafc"};border:1px solid ${fromSubmitter ? "#bbf7d0" : "#e2e8f0"}">
      <p style="margin:0 0 6px;font-size:12px;color:#6b7280"><strong style="color:#0f172a">${author}</strong> &middot; ${when}</p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">${escapeAndLineBreak(body)}</p>
      ${extra}
    </div>`;

  const attachmentLinks = (attachments: TranscriptEntry["attachments"]) =>
    attachments.length
      ? `<p style="margin:8px 0 0;font-size:12px">${attachments
          .map(
            (a) =>
              `<a href="${a.url}" style="color:#6366f1;text-decoration:none">📎 ${escapeAndLineBreak(a.name ?? "Attachment")}</a>`
          )
          .join("<br>")}</p>`
      : "";

  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a">Your conversation transcript</h1>
    <p style="margin:0 0 6px;font-size:15px;color:#374151;line-height:1.65">Hi ${escapeAndLineBreak(name)}, here's the full conversation on your ticket <strong>${escapeAndLineBreak(ticketLabel)}</strong> about <strong>${escapeAndLineBreak(productName)}</strong>.</p>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280">Current status: <strong style="color:#0f172a">${statusLabel}</strong></p>
    ${messageBlock("You", formatWhen(originalAt, timeZone), originalMessage, true)}
    ${entries
      .map((e) =>
        messageBlock(e.author, formatWhen(e.createdAt, timeZone), e.body, e.fromSubmitter, attachmentLinks(e.attachments))
      )
      .join("")}
    ${entries.length === 0 ? `<p style="margin:0 0 12px;font-size:14px;color:#6b7280">No replies yet — we'll email you when the support team writes back.</p>` : ""}
    ${ctaButton(url, "View or reply to your ticket")}`;

  const text = [
    `Conversation transcript — ${ticketLabel} (${productName})`,
    `Status: ${statusLabel}`,
    "",
    `You · ${formatWhen(originalAt, timeZone)}`,
    originalMessage,
    ...entries.flatMap((e) => [
      "",
      `${e.author} · ${formatWhen(e.createdAt, timeZone)}`,
      e.body,
      ...e.attachments.map((a) => `Attachment: ${a.name ?? "file"} — ${a.url}`),
    ]),
    "",
    `View or reply: ${url}`,
  ].join("\n");

  return send({
    to,
    subject: `Conversation transcript — ${ticketLabel}`,
    html: emailLayout(body, await resolveFooterEmail(params.organizationId)),
    text,
  });
}

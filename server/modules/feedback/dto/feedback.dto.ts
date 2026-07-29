// modules/feedback/dto/feedback.dto.ts
import type { Feedback } from "../entities/feedback.entity";
import type { FeedbackStatusHistory } from "../entities/feedbackStatusHistory.entity";
import type { FeedbackComment } from "../repositories/feedbackComment.repository";

const { FeedbackStatus, SupportStatus } = require("../../../config/constants");
const { formatReferenceCode } = require("../../../shared/utils/referenceCode");

// Human-readable code shown instead of the raw ticketNumber (e.g.
// "TKT-20260728-042") — same idea as a bug/feature request's referenceCode.
export function ticketCode(fb: { ticketNumber: number; createdAt: Date }): string {
  return formatReferenceCode("TKT", fb.ticketNumber, fb.createdAt);
}

// The label shown wherever a ticket is referenced in a single string — email
// subjects/bodies and in-app notification titles. UI list/detail views render
// ticketCode as its own badge instead of baking it into the title text.
export function ticketLabel(fb: { ticketNumber: number; title: string; createdAt: Date }): string {
  return `${ticketCode(fb)} — ${fb.title}`;
}

export function toFeedbackResponse(fb: Feedback | null) {
  if (!fb) return null;
  const project = fb.project as { name?: string } | undefined;
  return {
    id: fb.id,
    ticketNumber: fb.ticketNumber,
    ticketCode: ticketCode(fb),
    projectId: fb.projectId,
    // Present when the project relation was loaded (global cross-project mode).
    projectName: project?.name ?? null,
    clientCompanyId: fb.clientCompanyId ?? null,
    clientCompanyName: fb.clientCompany?.name ?? null,
    supportStatus: fb.supportStatus ?? null,
    supportResponse: fb.supportResponse ?? null,
    supportResolvedAt: fb.supportResolvedAt ?? null,
    escalatedAt: fb.escalatedAt ?? null,
    escalatedByName: fb.escalatedBy
      ? [fb.escalatedBy.firstName, fb.escalatedBy.lastName].filter(Boolean).join(" ")
      : null,
    assignedSupporterId: fb.assignedSupporterId ?? null,
    assignedSupporterName: fb.assignedSupporter
      ? [fb.assignedSupporter.firstName, fb.assignedSupporter.lastName].filter(Boolean).join(" ")
      : null,
    severity: fb.severity ?? null,
    submitterNotifiedAt: fb.submitterNotifiedAt ?? null,
    type: fb.type,
    title: fb.title,
    description: fb.description,
    suiteName: fb.suiteName ?? null,
    submitterName: fb.submitterName,
    submitterEmail: fb.submitterEmail,
    submitterPhone: fb.submitterPhone ?? null,
    status: fb.status,
    assignees: (fb.assignees ?? []).map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" "),
    })),
    adminResponse: fb.adminResponse ?? null,
    reopenReason: fb.reopenReason ?? null,
    attachments: (fb.attachments ?? []).map((a) => ({ id: a.id, url: a.url })),
    commentCount: fb.commentCount ?? 0,
    statusUpdatedAt: fb.statusUpdatedAt ?? null,
    createdAt: fb.createdAt,
  };
}

// Kept for API completeness (non-web clients / the server's own REST
// response to a just-posted comment) — the web app's read side is a
// realtime Firestore listener instead, see client/src/hooks/useFeedbackComments.ts.
export function toFeedbackCommentResponse(c: FeedbackComment) {
  return {
    id: c.id,
    feedbackId: c.feedbackId,
    authorType: c.authorType,
    authorId: c.authorId ?? null,
    authorName: c.authorName,
    body: c.body,
    attachments: (c.attachments ?? []).map((a) => ({
      url: a.url,
      name: a.name,
      mimeType: a.mimeType,
      bytes: a.bytes,
    })),
    createdAt: c.createdAt,
  };
}

// Ordered oldest → newest. The client derives per-stage durations from
// consecutive `enteredAt` timestamps (last entry's duration is ongoing).
export function toFeedbackTimelineResponse(rows: FeedbackStatusHistory[]) {
  return rows.map((r) => ({ status: r.status, enteredAt: r.enteredAt }));
}

// ── Submitter's own ticket history (no account — see requestMyTicketsCode /
// listMyTickets) ─────────────────────────────────────────────────────────────

// A collapsed, customer-facing status: internal triage granularity
// (acknowledged/assigned/investigating) is hidden, and "resolved" is
// deliberately NOT surfaced as done until the submitter has confirmed it —
// only `closed` reads as "resolved" externally.
export const SubmitterTicketStatus = Object.freeze({
  RECEIVED: "received",
  IN_PROGRESS: "in_progress",
  PENDING_YOUR_CONFIRMATION: "pending_your_confirmation",
  RESOLVED: "resolved",
});

const PRODUCT_SUBMITTER_STATUS_MAP: Record<string, string> = {
  [FeedbackStatus.LOGGED]: SubmitterTicketStatus.RECEIVED,
  [FeedbackStatus.ACKNOWLEDGED]: SubmitterTicketStatus.IN_PROGRESS,
  [FeedbackStatus.ASSIGNED]: SubmitterTicketStatus.IN_PROGRESS,
  [FeedbackStatus.INVESTIGATING]: SubmitterTicketStatus.IN_PROGRESS,
  [FeedbackStatus.RESOLVED]: SubmitterTicketStatus.IN_PROGRESS,
  [FeedbackStatus.AWAITING_CONFIRMATION]: SubmitterTicketStatus.PENDING_YOUR_CONFIRMATION,
  [FeedbackStatus.CLOSED]: SubmitterTicketStatus.RESOLVED,
};

// Before escalation, a company-routed ticket's real progress lives on
// supportStatus (the IT tier), not status (which stays "logged" — the
// product-tier lifecycle hasn't started yet).
const SUPPORT_SUBMITTER_STATUS_MAP: Record<string, string> = {
  [SupportStatus.LOGGED]: SubmitterTicketStatus.RECEIVED,
  [SupportStatus.ACKNOWLEDGED]: SubmitterTicketStatus.IN_PROGRESS,
  [SupportStatus.INVESTIGATING]: SubmitterTicketStatus.IN_PROGRESS,
  [SupportStatus.AWAITING_CONFIRMATION]: SubmitterTicketStatus.PENDING_YOUR_CONFIRMATION,
  [SupportStatus.RESOLVED]: SubmitterTicketStatus.RESOLVED,
};

export function toSubmitterStatus(fb: {
  status: string;
  clientCompanyId?: string | null;
  supportStatus?: string | null;
}): string {
  if (fb.clientCompanyId && fb.supportStatus && fb.supportStatus !== SupportStatus.ESCALATED) {
    return SUPPORT_SUBMITTER_STATUS_MAP[fb.supportStatus] ?? SubmitterTicketStatus.RECEIVED;
  }
  return PRODUCT_SUBMITTER_STATUS_MAP[fb.status] ?? SubmitterTicketStatus.RECEIVED;
}

// Only surfaces a note that was actually emailed to the true submitter.
// `supportResponse` also carries the IT supporter's internal escalation
// context (never sent to the submitter) — once escalated, it's only safe to
// show once notifySubmitterFixed has relayed a fix and overwritten it.
function toMyTicketNote(fb: Feedback): string | null {
  if (fb.clientCompanyId) {
    if (fb.supportStatus === SupportStatus.ESCALATED) {
      return fb.submitterNotifiedAt ? fb.supportResponse ?? null : null;
    }
    return fb.supportResponse ?? null;
  }
  return fb.adminResponse ?? null;
}

export function toMyTicketResponse(fb: Feedback) {
  const project = fb.project as { name?: string; feedbackToken?: string | null } | undefined;
  // Same form the submitter originally used to reach this ticket — company
  // items link back to the company's form, direct items to the project's.
  // Null if that link has since been disabled (see getPublicConfirmationContext).
  const feedbackToken = fb.clientCompanyId
    ? fb.clientCompany?.feedbackToken ?? null
    : project?.feedbackToken ?? null;
  return {
    id: fb.id,
    ticketNumber: fb.ticketNumber,
    ticketCode: ticketCode(fb),
    projectName: project?.name ?? null,
    clientCompanyName: fb.clientCompany?.name ?? null,
    type: fb.type,
    title: fb.title,
    status: toSubmitterStatus(fb),
    note: toMyTicketNote(fb),
    feedbackToken,
    createdAt: fb.createdAt,
    updatedAt: fb.statusUpdatedAt ?? fb.createdAt,
  };
}

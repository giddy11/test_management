// modules/feedback/dto/feedback.dto.ts
import type { Feedback } from "../entities/feedback.entity";
import type { FeedbackStatusHistory } from "../entities/feedbackStatusHistory.entity";

const { FeedbackStatus, SupportStatus } = require("../../../config/constants");

// The label shown wherever a ticket is referenced in a single string — email
// subjects/bodies and in-app notification titles. UI list/detail views render
// ticketNumber as its own badge instead of baking it into the title text.
export function ticketLabel(fb: { ticketNumber: number; title: string }): string {
  return `#${fb.ticketNumber} — ${fb.title}`;
}

export function toFeedbackResponse(fb: Feedback | null) {
  if (!fb) return null;
  const project = fb.project as { name?: string } | undefined;
  return {
    id: fb.id,
    ticketNumber: fb.ticketNumber,
    projectId: fb.projectId,
    // Present when the project relation was loaded (global cross-project mode).
    projectName: project?.name ?? null,
    source: fb.source,
    externalRef: fb.externalRef ?? null,
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
    statusUpdatedAt: fb.statusUpdatedAt ?? null,
    createdAt: fb.createdAt,
  };
}

// Ordered oldest → newest. The client derives per-stage durations from
// consecutive `enteredAt` timestamps (last entry's duration is ongoing).
export function toFeedbackTimelineResponse(rows: FeedbackStatusHistory[]) {
  return rows.map((r) => ({ status: r.status, enteredAt: r.enteredAt }));
}

// ── Partner integration API (server-to-server) ──────────────────────────────

// A collapsed, customer-facing status: internal triage granularity
// (acknowledged/assigned/investigating) is hidden, and "resolved" is
// deliberately NOT surfaced as done until the submitter has confirmed it —
// only `closed` reads as "resolved" externally. Reusable by any future
// customer-facing surface, not just the integration endpoints.
export const ExternalFeedbackStatus = Object.freeze({
  RECEIVED: "received",
  IN_PROGRESS: "in_progress",
  PENDING_YOUR_CONFIRMATION: "pending_your_confirmation",
  RESOLVED: "resolved",
});

const PRODUCT_EXTERNAL_STATUS_MAP: Record<string, string> = {
  [FeedbackStatus.LOGGED]: ExternalFeedbackStatus.RECEIVED,
  [FeedbackStatus.ACKNOWLEDGED]: ExternalFeedbackStatus.IN_PROGRESS,
  [FeedbackStatus.ASSIGNED]: ExternalFeedbackStatus.IN_PROGRESS,
  [FeedbackStatus.INVESTIGATING]: ExternalFeedbackStatus.IN_PROGRESS,
  [FeedbackStatus.RESOLVED]: ExternalFeedbackStatus.IN_PROGRESS,
  [FeedbackStatus.AWAITING_CONFIRMATION]: ExternalFeedbackStatus.PENDING_YOUR_CONFIRMATION,
  [FeedbackStatus.CLOSED]: ExternalFeedbackStatus.RESOLVED,
};

// Before escalation, a company-routed ticket's real progress lives on
// supportStatus (the IT tier), not status (which stays "logged" — the
// product-tier lifecycle hasn't started yet). IT support resolves directly
// with no separate submitter-confirmation step, so "resolved" here is final.
const SUPPORT_EXTERNAL_STATUS_MAP: Record<string, string> = {
  [SupportStatus.LOGGED]: ExternalFeedbackStatus.RECEIVED,
  [SupportStatus.ACKNOWLEDGED]: ExternalFeedbackStatus.IN_PROGRESS,
  [SupportStatus.INVESTIGATING]: ExternalFeedbackStatus.IN_PROGRESS,
  [SupportStatus.RESOLVED]: ExternalFeedbackStatus.RESOLVED,
};

export function toExternalStatus(fb: {
  status: string;
  clientCompanyId?: string | null;
  supportStatus?: string | null;
}): string {
  if (fb.clientCompanyId && fb.supportStatus && fb.supportStatus !== SupportStatus.ESCALATED) {
    return SUPPORT_EXTERNAL_STATUS_MAP[fb.supportStatus] ?? ExternalFeedbackStatus.RECEIVED;
  }
  return PRODUCT_EXTERNAL_STATUS_MAP[fb.status] ?? ExternalFeedbackStatus.RECEIVED;
}

export function toIntegrationTicketResponse(fb: Feedback) {
  return {
    id: fb.id,
    ticketNumber: fb.ticketNumber,
    externalRef: fb.externalRef ?? null,
    type: fb.type,
    title: fb.title,
    description: fb.description,
    status: toExternalStatus(fb),
    submitterName: fb.submitterName,
    submitterEmail: fb.submitterEmail,
    submitterPhone: fb.submitterPhone ?? null,
    adminResponse: fb.adminResponse ?? null,
    createdAt: fb.createdAt,
    updatedAt: fb.statusUpdatedAt ?? fb.createdAt,
  };
}

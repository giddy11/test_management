// modules/feedback/dto/feedback.dto.ts
import type { Feedback } from "../entities/feedback.entity";
import type { FeedbackStatusHistory } from "../entities/feedbackStatusHistory.entity";

const { FeedbackStatus } = require("../../../config/constants");

export function toFeedbackResponse(fb: Feedback | null) {
  if (!fb) return null;
  const project = fb.project as { name?: string } | undefined;
  return {
    id: fb.id,
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

const EXTERNAL_STATUS_MAP: Record<string, string> = {
  [FeedbackStatus.LOGGED]: ExternalFeedbackStatus.RECEIVED,
  [FeedbackStatus.ACKNOWLEDGED]: ExternalFeedbackStatus.IN_PROGRESS,
  [FeedbackStatus.ASSIGNED]: ExternalFeedbackStatus.IN_PROGRESS,
  [FeedbackStatus.INVESTIGATING]: ExternalFeedbackStatus.IN_PROGRESS,
  [FeedbackStatus.RESOLVED]: ExternalFeedbackStatus.IN_PROGRESS,
  [FeedbackStatus.AWAITING_CONFIRMATION]: ExternalFeedbackStatus.PENDING_YOUR_CONFIRMATION,
  [FeedbackStatus.CLOSED]: ExternalFeedbackStatus.RESOLVED,
};

export function toExternalStatus(status: string): string {
  return EXTERNAL_STATUS_MAP[status] ?? ExternalFeedbackStatus.RECEIVED;
}

export function toIntegrationTicketResponse(fb: Feedback) {
  return {
    id: fb.id,
    externalRef: fb.externalRef ?? null,
    type: fb.type,
    title: fb.title,
    description: fb.description,
    status: toExternalStatus(fb.status),
    submitterName: fb.submitterName,
    submitterEmail: fb.submitterEmail,
    submitterPhone: fb.submitterPhone ?? null,
    adminResponse: fb.adminResponse ?? null,
    createdAt: fb.createdAt,
    updatedAt: fb.statusUpdatedAt ?? fb.createdAt,
  };
}

// modules/feedback/dto/feedback.dto.ts
import type { Feedback } from "../entities/feedback.entity";
import type { FeedbackStatusHistory } from "../entities/feedbackStatusHistory.entity";

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

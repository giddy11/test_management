// modules/feedback/dto/feedback.dto.ts
import type { Feedback } from "../entities/feedback.entity";

export function toFeedbackResponse(fb: Feedback | null) {
  if (!fb) return null;
  const assignee = fb.assignedTo as
    | { id: string; firstName: string; lastName: string | null }
    | undefined;
  return {
    id: fb.id,
    projectId: fb.projectId,
    type: fb.type,
    title: fb.title,
    description: fb.description,
    suiteName: fb.suiteName ?? null,
    submitterName: fb.submitterName,
    submitterEmail: fb.submitterEmail,
    status: fb.status,
    assignedTo: assignee
      ? { id: assignee.id, name: [assignee.firstName, assignee.lastName].filter(Boolean).join(" ") }
      : null,
    adminResponse: fb.adminResponse ?? null,
    attachments: (fb.attachments ?? []).map((a) => ({ id: a.id, url: a.url })),
    statusUpdatedAt: fb.statusUpdatedAt ?? null,
    createdAt: fb.createdAt,
  };
}

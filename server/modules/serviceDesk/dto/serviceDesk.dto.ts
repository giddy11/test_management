// modules/serviceDesk/dto/serviceDesk.dto.ts
// What leaves the API. The portal view of an item hides who approves it and
// IT's fulfilment notes; the admin view carries both.
import type { ServiceCatalogCategory } from "../entities/serviceCatalogCategory.entity";
import type { ServiceCatalogItem } from "../entities/serviceCatalogItem.entity";
import type { PersonRow } from "../repositories/serviceDesk.repository";
import type { AttachmentRow, CommentRow, RequestRow } from "../repositories/serviceRequest.repository";
import { formatReference } from "../domain/lifecycle";
import { neededByOf } from "../domain/neededBy";

export function toCategoryDto(c: ServiceCatalogCategory) {
  return {
    id: c.id,
    key: c.key,
    name: c.name,
    description: c.description,
    icon: c.icon,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
  };
}

export function toPortalItemDto(i: ServiceCatalogItem) {
  return {
    id: i.id,
    categoryId: i.categoryId,
    name: i.name,
    description: i.description,
    formSchema: i.formSchema ?? [],
    needsApproval: i.approvalMode !== "none",
  };
}

export function toAdminItemDto(i: ServiceCatalogItem, people: Map<string, PersonRow>, policyName: string | null = null) {
  return {
    ...toPortalItemDto(i),
    approvalMode: i.approvalMode,
    // Approvers who have since left the organisation drop out of the list.
    approvers: (i.approverIds ?? [])
      .map((id) => people.get(id))
      .filter((p): p is PersonRow => !!p)
      .map((p) => ({ id: p.id, name: p.name || p.email, email: p.email })),
    approvalPolicyId: i.approvalPolicyId,
    approvalPolicyName: policyName,
    riskLevel: i.riskLevel,
    approvalHours: i.approvalHours,
    fulfilmentHours: i.fulfilmentHours,
    requiresIdentityCheck: i.requiresIdentityCheck ?? false,
    fulfilmentNotes: i.fulfilmentNotes,
    isActive: i.isActive,
    sortOrder: i.sortOrder,
    version: i.version,
    updatedAt: i.updatedAt,
  };
}

export function toPersonDto(p: PersonRow) {
  return { id: p.id, name: p.name || p.email, email: p.email };
}

// Which phase, if any, is past its service level right now.
function overdueOf(r: RequestRow, now = Date.now()): "approval" | "fulfilment" | null {
  if (r.status === "pending_approval" && r.approvalDueAt && new Date(r.approvalDueAt).getTime() < now) return "approval";
  if (
    (r.status === "submitted" || r.status === "approved" || r.status === "in_progress") &&
    r.fulfilmentDueAt &&
    new Date(r.fulfilmentDueAt).getTime() < now
  ) {
    return "fulfilment";
  }
  return null;
}

export function toRequestDto(r: RequestRow) {
  const requestedFor = r.requestedForId
    ? { id: r.requestedForId, name: r.requestedForUserName ?? r.requestedForUserEmail ?? "", email: r.requestedForUserEmail }
    : r.requestedForName || r.requestedForEmail
      ? { id: null, name: r.requestedForName ?? r.requestedForEmail ?? "", email: r.requestedForEmail }
      : null;
  const overdue = overdueOf(r);
  return {
    id: r.id,
    reference: formatReference(r.requestNumber),
    catalogItemId: r.catalogItemId,
    item: {
      name: r.itemSnapshot.name,
      categoryKey: r.itemSnapshot.categoryKey,
      categoryName: r.itemSnapshot.categoryName,
      formSchema: r.itemSnapshot.formSchema ?? [],
      needsApproval: r.itemSnapshot.approvalMode !== "none",
      approvalPolicyName: r.itemSnapshot.approvalPolicyName ?? null,
      requiresIdentityCheck: r.itemSnapshot.requiresIdentityCheck ?? false,
    },
    identityVerifiedAt: r.identityVerifiedAt,
    requester: { id: r.requesterId, name: r.requesterName, email: r.requesterEmail },
    requestedFor,
    title: r.title,
    description: r.description,
    businessJustification: r.businessJustification,
    priority: r.priority,
    riskLevel: r.riskLevel ?? "low",
    formValues: r.formValues ?? {},
    status: r.status,
    assignee: r.assigneeId ? { id: r.assigneeId, name: r.assigneeName ?? "" } : null,
    resolutionNote: r.resolutionNote,
    currentStep: r.currentStep,
    approvalDueAt: r.approvalDueAt,
    fulfilmentDueAt: r.fulfilmentDueAt,
    // The requester's "Needed by" answer, and whether it's at risk.
    neededBy: neededByOf({ ...r, formSchema: r.itemSnapshot.formSchema }),
    overdue,
    escalationLevel: overdue === "approval" ? r.approvalEscalationLevel : overdue === "fulfilment" ? r.fulfilmentEscalationLevel : 0,
    infoRequestedAt: r.infoRequestedAt,
    infoRequestedFrom: r.infoRequestedFrom,
    submittedAt: r.submittedAt,
    approvedAt: r.approvedAt,
    startedAt: r.startedAt,
    fulfilledAt: r.fulfilledAt,
    cancelledAt: r.cancelledAt,
    statusUpdatedAt: r.statusUpdatedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// One message in the conversation. A deleted message is a tombstone: no text,
// no mentions, no files, but it keeps its place and its replies.
export function toCommentDto(c: CommentRow, files: AttachmentRow[] = []) {
  const deleted = !!c.deletedAt;
  return {
    id: c.id,
    authorId: c.authorId,
    authorName: c.authorName,
    body: deleted ? "" : c.body,
    isInternal: c.isInternal,
    parentId: c.parentId,
    mentions: deleted ? [] : c.mentions ?? [],
    attachments: deleted ? [] : files.map(toAttachmentDto),
    editedAt: c.editedAt,
    deletedAt: c.deletedAt,
    createdAt: c.createdAt,
  };
}

export function toAttachmentDto(a: AttachmentRow) {
  return {
    id: a.id,
    fileName: a.fileName,
    fileUrl: a.fileUrl,
    isImage: a.resourceType === "image",
    mimeType: a.mimeType,
    fileSizeBytes: a.fileSizeBytes,
    uploadedBy: a.uploadedById ? { id: a.uploadedById, name: a.uploadedByName ?? "" } : null,
    createdAt: a.createdAt,
  };
}

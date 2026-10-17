// modules/serviceDesk/dto/serviceDesk.dto.ts
// What leaves the API. The portal view of an item hides who approves it and
// IT's fulfilment notes; the admin view carries both.
import type { ServiceCatalogCategory } from "../entities/serviceCatalogCategory.entity";
import type { ServiceCatalogItem } from "../entities/serviceCatalogItem.entity";
import type { PersonRow } from "../repositories/serviceDesk.repository";
import type { RequestRow } from "../repositories/serviceRequest.repository";
import { formatReference } from "../domain/lifecycle";

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
    needsApproval: i.approvalMode === "approvers",
  };
}

export function toAdminItemDto(i: ServiceCatalogItem, people: Map<string, PersonRow>) {
  return {
    ...toPortalItemDto(i),
    approvalMode: i.approvalMode,
    // Approvers who have since left the organisation drop out of the list.
    approvers: (i.approverIds ?? [])
      .map((id) => people.get(id))
      .filter((p): p is PersonRow => !!p)
      .map((p) => ({ id: p.id, name: p.name || p.email, email: p.email })),
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

export function toRequestDto(r: RequestRow) {
  const requestedFor = r.requestedForId
    ? { id: r.requestedForId, name: r.requestedForUserName ?? r.requestedForUserEmail ?? "", email: r.requestedForUserEmail }
    : r.requestedForName || r.requestedForEmail
      ? { id: null, name: r.requestedForName ?? r.requestedForEmail ?? "", email: r.requestedForEmail }
      : null;
  return {
    id: r.id,
    reference: formatReference(r.requestNumber),
    catalogItemId: r.catalogItemId,
    item: {
      name: r.itemSnapshot.name,
      categoryKey: r.itemSnapshot.categoryKey,
      categoryName: r.itemSnapshot.categoryName,
      formSchema: r.itemSnapshot.formSchema ?? [],
      needsApproval: r.itemSnapshot.approvalMode === "approvers",
    },
    requester: { id: r.requesterId, name: r.requesterName, email: r.requesterEmail },
    requestedFor,
    title: r.title,
    description: r.description,
    businessJustification: r.businessJustification,
    priority: r.priority,
    formValues: r.formValues ?? {},
    status: r.status,
    assignee: r.assigneeId ? { id: r.assigneeId, name: r.assigneeName ?? "" } : null,
    resolutionNote: r.resolutionNote,
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

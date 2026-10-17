// types/serviceDesk.types.ts — IT requests (a module of its own, separate from
// testing). Mirrors server/modules/serviceDesk: domain/lifecycle.ts,
// domain/formSchema.ts and dto/serviceDesk.dto.ts — keep them in step.

export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "pending_approval",
  "approved",
  "rejected",
  "in_progress",
  "fulfilled",
  "cancelled",
] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const REQUEST_PRIORITIES = ["low", "medium", "high", "critical"] as const
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number]

export type ApprovalMode = "none" | "approvers"
export type ApprovalDecision = "pending" | "approved" | "rejected" | "skipped"

export const STATUS_META: Record<RequestStatus, { label: string; badge: string }> = {
  draft: { label: "Draft", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  submitted: { label: "Submitted", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  pending_approval: { label: "Pending approval", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  approved: { label: "Approved", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  rejected: { label: "Rejected", badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  in_progress: { label: "In progress", badge: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  fulfilled: { label: "Fulfilled", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
}

export const PRIORITY_META: Record<RequestPriority, { label: string; badge: string }> = {
  low: { label: "Low", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  medium: { label: "Medium", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  high: { label: "High", badge: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  critical: { label: "Critical", badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
}

// ── Forms ────────────────────────────────────────────────────────────────────
export const FIELD_TYPES = ["text", "textarea", "number", "date", "select", "multiselect", "checkbox"] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  date: "Date",
  select: "Pick one",
  multiselect: "Pick several",
  checkbox: "Tick box",
}

export interface FormField {
  key: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
  helpText?: string | null
}

export type FormValue = string | number | boolean | string[]
export type FormValues = Record<string, FormValue>

// ── Catalog ──────────────────────────────────────────────────────────────────
export interface Person {
  id: string
  name: string
  email: string
}

export interface CatalogCategory {
  id: string
  key: string
  name: string
  description: string | null
  icon: string | null
  sortOrder: number
  isActive: boolean
}

export interface PortalItem {
  id: string
  categoryId: string
  name: string
  description: string | null
  formSchema: FormField[]
  needsApproval: boolean
}

export interface AdminItem extends PortalItem {
  approvalMode: ApprovalMode
  approvers: Person[]
  fulfilmentNotes: string | null
  isActive: boolean
  sortOrder: number
  version: number
  updatedAt: string
}

export type PortalCategory = CatalogCategory & { items: PortalItem[] }
export type AdminCategory = CatalogCategory & { items: AdminItem[] }

export interface ServiceDeskSettings {
  enabled: boolean
}

export interface CategoryPayload {
  name?: string
  description?: string | null
  icon?: string | null
  sortOrder?: number
  isActive?: boolean
}

export interface ItemPayload {
  categoryId?: string
  name?: string
  description?: string | null
  formSchema?: FormField[]
  approvalMode?: ApprovalMode
  approverIds?: string[]
  fulfilmentNotes?: string | null
  isActive?: boolean
  sortOrder?: number
}

// ── Requests ─────────────────────────────────────────────────────────────────
export interface ServiceRequest {
  id: string
  reference: string
  catalogItemId: string | null
  item: {
    name: string
    categoryKey: string
    categoryName: string
    formSchema: FormField[]
    needsApproval: boolean
  }
  requester: { id: string; name: string; email: string }
  requestedFor: { id: string | null; name: string; email: string | null } | null
  title: string
  description: string | null
  businessJustification: string | null
  priority: RequestPriority
  formValues: FormValues
  status: RequestStatus
  assignee: { id: string; name: string } | null
  resolutionNote: string | null
  submittedAt: string | null
  approvedAt: string | null
  startedAt: string | null
  fulfilledAt: string | null
  cancelledAt: string | null
  statusUpdatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RequestApproval {
  id: string
  stepOrder: number
  approverId: string
  approverName: string
  decision: ApprovalDecision
  comment: string | null
  decidedAt: string | null
}

export interface RequestHistoryEntry {
  id: string
  fromStatus: RequestStatus | null
  toStatus: RequestStatus
  actorName: string | null
  note: string | null
  createdAt: string
}

export interface RequestComment {
  id: string
  authorId: string | null
  authorName: string | null
  body: string
  isInternal: boolean
  createdAt: string
}

export interface RequestViewer {
  isRequester: boolean
  isApprover: boolean
  isAgent: boolean
  canEdit: boolean
  canDecide: boolean
  canCancel: boolean
  cancelNeedsReason: boolean
  canAssign: boolean
  canStart: boolean
  canFulfil: boolean
  canComment: boolean
  canAddInternalNote: boolean
}

export interface RequestDetail {
  request: ServiceRequest
  approvals: RequestApproval[]
  history: RequestHistoryEntry[]
  comments: RequestComment[]
  fulfilmentNotes: string | null
  viewer: RequestViewer
}

export interface RequestPayload {
  catalogItemId: string
  title: string
  description?: string | null
  businessJustification?: string | null
  priority?: RequestPriority
  formValues?: FormValues
  requestedForId?: string | null
  requestedForName?: string | null
  requestedForEmail?: string | null
}

export type QueueView = "ready" | "open" | "closed"

export interface ListRequestsParams {
  scope: "mine" | "queue"
  status?: RequestStatus
  view?: QueueView
  assignee?: "me" | "unassigned" | string
  search?: string
  page?: number
  limit?: number
}

export interface ServiceDeskCounts {
  pendingApprovals: number
  queue: { ready: number; unassigned: number; mine: number; awaitingApproval: number } | null
}

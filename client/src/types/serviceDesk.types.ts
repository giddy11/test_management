// types/serviceDesk.types.ts — IT requests (a module of its own, separate from
// testing). Mirrors server/modules/serviceDesk: domain/lifecycle.ts,
// domain/formSchema.ts and dto/serviceDesk.dto.ts — keep them in step.

export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "pending_approval",
  "approved",
  "rejected",
  "info_requested",
  "in_progress",
  "fulfilled",
  "cancelled",
] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const REQUEST_PRIORITIES = ["low", "medium", "high", "critical"] as const
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number]

export type ApprovalMode = "none" | "approvers" | "policy"
export type ApprovalDecision = "waiting" | "pending" | "approved" | "rejected" | "skipped"

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const RISK_META: Record<RiskLevel, { label: string; badge: string }> = {
  low: { label: "Low risk", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  medium: { label: "Medium risk", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  high: { label: "High risk", badge: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  critical: { label: "Critical risk", badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
}

export const STATUS_META: Record<RequestStatus, { label: string; badge: string }> = {
  draft: { label: "Draft", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  submitted: { label: "Submitted", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  pending_approval: { label: "Pending approval", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  approved: { label: "Approved", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  rejected: { label: "Rejected", badge: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  info_requested: { label: "Waiting for information", badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
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
  approvalPolicyId: string | null
  approvalPolicyName: string | null
  riskLevel: RiskLevel
  approvalHours: number | null
  fulfilmentHours: number | null
  fulfilmentNotes: string | null
  isActive: boolean
  sortOrder: number
  version: number
  updatedAt: string
}

export type PortalCategory = CatalogCategory & { items: PortalItem[] }
export type AdminCategory = CatalogCategory & { items: AdminItem[] }

export interface EscalationRules {
  level2Pct: number
  level3Pct: number
  contactIds: string[]
}

export interface ServiceLevels {
  approvalHours: number
  fulfilmentHours: Record<RequestPriority, number>
  escalation: EscalationRules
}

export interface ServiceDeskSettings {
  enabled: boolean
  serviceLevels: ServiceLevels
}

// ── Approval setup ───────────────────────────────────────────────────────────
export type ApproverRule =
  | { type: "line_manager" }
  | { type: "group"; groupId: string }
  | { type: "user"; userId: string }

export type StepMode = "any" | "all"

export interface PolicyStep {
  name: string
  mode: StepMode
  approvers: ApproverRule[]
}

export interface ApprovalPolicy {
  id: string
  name: string
  description: string | null
  steps: PolicyStep[]
  itemCount: number
  updatedAt: string
}

export interface ApproverGroup {
  id: string
  name: string
  description: string | null
  maxRiskLevel: RiskLevel
  members: Person[]
}

export interface ManagerRow {
  id: string
  name: string
  email: string
  managerId: string | null
  managerName: string | null
}

export interface Delegation {
  userId: string
  delegateId: string
  delegateName: string
  startsOn: string
  endsOn: string
  note: string | null
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
  approvalPolicyId?: string | null
  riskLevel?: RiskLevel
  approvalHours?: number | null
  fulfilmentHours?: number | null
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
    approvalPolicyName: string | null
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
  riskLevel: RiskLevel
  currentStep: number | null
  approvalDueAt: string | null
  fulfilmentDueAt: string | null
  // Which phase is past its service level right now, if any.
  overdue: "approval" | "fulfilment" | null
  escalationLevel: number
  infoRequestedAt: string | null
  infoRequestedFrom: RequestStatus | null
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
  stepName: string | null
  stepMode: StepMode
  ruleIndex: number
  approverId: string
  approverName: string
  groupId: string | null
  groupName: string | null
  isFallback: boolean
  onBehalfOfId: string | null
  onBehalfOfName: string | null
  decision: ApprovalDecision
  comment: string | null
  decidedAt: string | null
  decidedById: string | null
  decidedByName: string | null
  authorityLevel: RiskLevel | null
}

export interface RequestAttachment {
  id: string
  fileName: string
  fileUrl: string
  isImage: boolean
  mimeType: string | null
  fileSizeBytes: number | null
  uploadedBy: { id: string; name: string } | null
  createdAt: string
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
  canAskInfo: boolean
  canProvideInfo: boolean
  canAttach: boolean
  myUserId: string
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
  attachments: RequestAttachment[]
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

export type QueueView = "ready" | "open" | "closed" | "overdue"

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
  queue: {
    ready: number
    unassigned: number
    mine: number
    awaitingApproval: number
    waitingOnRequester: number
    overdue: number
  } | null
}

// ── Reports ──────────────────────────────────────────────────────────────────
export interface ServiceDeskReport {
  range: { from: string; to: string }
  now: {
    open: number
    pendingApproval: number
    overdueApproval: number
    readyForIt: number
    inProgress: number
    overdueFulfilment: number
    waitingOnRequester: number
  }
  throughput: {
    submitted: number
    fulfilled: number
    rejected: number
    cancelled: number
    avgApprovalHours: number | null
    avgFulfilmentHours: number | null
    fulfilledWithTarget: number
    fulfilledOnTime: number
    onTimeRate: number | null
  }
  escalations: Record<"approval" | "fulfilment", { level1: number; level2: number; level3: number }>
  byCategory: {
    category: string
    submitted: number
    fulfilled: number
    open: number
    avgFulfilmentHours: number | null
    fulfilledLate: number
  }[]
  byAssignee: { id: string; name: string; fulfilled: number; inProgress: number; avgWorkHours: number | null }[]
  overdue: {
    id: string
    reference: string
    title: string
    status: RequestStatus
    priority: RequestPriority
    phase: "approval" | "fulfilment"
    dueAt: string
    escalationLevel: number
    assigneeName: string | null
  }[]
  serviceLevels: ServiceLevels
}

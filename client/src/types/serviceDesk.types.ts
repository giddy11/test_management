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
  // Set when the item is handled by a self-service link (deflect).
  selfService: { url: string; label: string } | null
}

export type FulfilmentType = "manual" | "webhook" | "deflect"

export interface FulfilmentConfig {
  endpointId?: string | null
  url?: string | null
  label?: string | null
}

export interface AdminItem extends PortalItem {
  approvalMode: ApprovalMode
  approvers: Person[]
  approvalPolicyId: string | null
  approvalPolicyName: string | null
  riskLevel: RiskLevel
  approvalHours: number | null
  fulfilmentHours: number | null
  fulfilmentType: FulfilmentType
  fulfilmentConfig: FulfilmentConfig
  autoApprove: boolean
  isPrivileged: boolean
  requiresIdentityCheck: boolean
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
  fulfilmentType?: FulfilmentType
  fulfilmentConfig?: FulfilmentConfig
  autoApprove?: boolean
  isPrivileged?: boolean
  requiresIdentityCheck?: boolean
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
    fulfilmentType: FulfilmentType
    requiresIdentityCheck: boolean
  }
  // Phase 3
  needsReview: boolean
  reviewReason: string | null // IT only
  autoApproved: boolean
  automationStatus: "running" | "succeeded" | "failed" | "manual" | null
  fulfilledBy: "person" | "automation" | "self_service" | null
  identityVerifiedAt: string | null
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
  // The requester's "Needed by" answer (a needed_by date question) and
  // whether it's at risk: gone, later than the target, or within two days.
  neededBy: { date: string; warning: NeededByWarning | null } | null
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

export type NeededByWarning = "passed" | "after_target" | "soon"

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
  needsIdentityCheck: boolean
  canRecordIdentity: boolean
  canClearReview: boolean
  canRunAutomation: boolean
  canTakeOver: boolean
  canAiTriage: boolean
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
  automationRuns: RequestAutomationRun[] // IT only
  identityCheck: { verifiedAt: string; verifiedByName: string | null; method: string | null; note: string | null } | null
  aiTriage: AiTriage | null // approvers and IT
  viewer: RequestViewer
}

// ── Automation (Phase 3) ─────────────────────────────────────────────────────
export type RunKind = "rule" | "auto_approve" | "webhook" | "deflect" | "ai_triage"
export type RunStatus = "succeeded" | "failed" | "skipped" | "pending" | "retrying"

export interface RequestAutomationRun {
  id: string
  kind: RunKind
  status: RunStatus
  ruleName: string | null
  endpointName: string | null
  attempt: number
  nextAttemptAt: string | null
  reason: string | null
  note: string | null
  error: string | null
  initiatedByName: string | null
  startedAt: string
  finishedAt: string | null
}

export interface AutomationRunRow extends RequestAutomationRun {
  requestId: string
  requestNumber: number
  requestTitle: string
}

export interface AiTriage {
  summary: string
  riskNotes: string[]
  missingInfo: string[]
  suggestedPriority: RequestPriority | null
  suggestion: "approve" | "reject" | "ask_for_info" | "no_view"
  suggestionReason: string
  generatedAt: string
  generatedById: string
  generatedByName: string
  model: string
}

export interface RuleConditions {
  categoryKeys: string[]
  itemIds: string[]
  priorities: RequestPriority[]
  riskLevels: RiskLevel[]
  forNewStarter: boolean | null
  answers: { key: string; value: string | number | boolean }[]
  textContains: string
}

export interface RuleActions {
  setPriority: RequestPriority | null
  assignToId: string | null
  flagForReview: string
  internalNote: string
  autoApprove: boolean
}

export interface AutomationRule {
  id: string
  name: string
  description: string | null
  sortOrder: number
  isActive: boolean
  conditions: RuleConditions
  actions: RuleActions
  updatedAt: string
}

export interface RulePayload {
  name?: string
  description?: string | null
  sortOrder?: number
  isActive?: boolean
  conditions?: RuleConditions
  actions?: RuleActions
}

export interface DryRunResult {
  checked: number
  matched: number
  matches: { id: string; reference: string; title: string; item: string; wouldAutoApprove: boolean | null; autoApproveRefusal: string | null }[]
}

export interface WebhookEndpoint {
  id: string
  name: string
  urlDisplay: string
  isActive: boolean
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastFailure: string | null
  itemCount: number
  createdAt: string
}

export interface IntakeSuggestion {
  itemId: string | null
  item: { id: string; name: string; categoryName: string } | null
  title: string
  formValues: FormValues
  priority: RequestPriority
  missingInfo: string[]
  reason: string
  model: string
  creditsCharged: number
}

// What the form page receives when opened from an AI suggestion.
export interface RequestPrefill {
  title?: string
  formValues?: FormValues
  priority?: RequestPriority
  description?: string
  fromAi?: boolean
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

export type QueueView = "ready" | "open" | "closed" | "overdue" | "review"

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
    needsReview: number
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
  automation: {
    rulesApplied: number
    autoApproved: number
    autoApprovalRefused: number
    webhookSucceeded: number
    webhookFailed: number
    webhookInFlight: number
    selfService: number
    aiTriage: number
    needsReview: number
    automationFailed: number
    fulfilledByAutomation: number
    fulfilledBySelfService: number
    fulfilledByPerson: number
    webhookSuccessRate: number | null
  }
}

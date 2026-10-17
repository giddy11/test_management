// endpoints/serviceDesk.endpoints.ts — IT requests (/api/v1/service-desk).
import { uploadCall, wrapCall } from "@/transport/http"
import type {
  AiTriage,
  AutomationRule,
  AutomationRunRow,
  DryRunResult,
  IntakeSuggestion,
  RuleActions,
  RuleConditions,
  RulePayload,
  RunKind,
  RunStatus,
  WebhookEndpoint,
  AdminCategory,
  AdminItem,
  ApprovalPolicy,
  ApproverGroup,
  Delegation,
  ManagerRow,
  PolicyStep,
  RequestAttachment,
  RiskLevel,
  ServiceDeskReport,
  ServiceLevels,
  CatalogCategory,
  CategoryPayload,
  ItemPayload,
  ListRequestsParams,
  Person,
  PortalCategory,
  RequestComment,
  RequestDetail,
  RequestPayload,
  ServiceDeskCounts,
  ServiceDeskSettings,
  ServiceRequest,
} from "@/types/serviceDesk.types"

const BASE = "/api/v1/service-desk"
const body = (v: object) => v as unknown as Record<string, unknown>

export const ServiceDeskEndpoints = {
  // Settings
  settings: () => wrapCall<ServiceDeskSettings>("GET", `${BASE}/settings`),
  updateSettings: (enabled: boolean) => wrapCall<ServiceDeskSettings>("PUT", `${BASE}/settings`, { enabled }),

  // Catalog
  portalCatalog: () => wrapCall<PortalCategory[]>("GET", `${BASE}/catalog`),
  adminCatalog: () => wrapCall<AdminCategory[]>("GET", `${BASE}/catalog/admin`),
  createCategory: (payload: CategoryPayload) => wrapCall<CatalogCategory>("POST", `${BASE}/catalog/categories`, body(payload)),
  updateCategory: (id: string, payload: CategoryPayload) =>
    wrapCall<CatalogCategory>("PATCH", `${BASE}/catalog/categories/${id}`, body(payload)),
  createItem: (payload: ItemPayload) => wrapCall<AdminItem>("POST", `${BASE}/catalog/items`, body(payload)),
  updateItem: (id: string, payload: ItemPayload) => wrapCall<AdminItem>("PATCH", `${BASE}/catalog/items/${id}`, body(payload)),
  // Refused (409) once anything was requested — hide it instead.
  deleteCategory: (id: string) => wrapCall<null>("DELETE", `${BASE}/catalog/categories/${id}`),
  deleteItem: (id: string) => wrapCall<null>("DELETE", `${BASE}/catalog/items/${id}`),

  // People
  approverCandidates: () => wrapCall<Person[]>("GET", `${BASE}/people/approvers`),
  agents: () => wrapCall<Person[]>("GET", `${BASE}/people/agents`),
  colleagues: (search?: string) => wrapCall<Person[]>("GET", `${BASE}/people/colleagues`, search ? { search } : undefined),

  // Requests
  counts: () => wrapCall<ServiceDeskCounts>("GET", `${BASE}/counts`),
  list: (params: ListRequestsParams) => wrapCall<ServiceRequest[]>("GET", `${BASE}/requests`, body(params)),
  approvals: (state: "pending" | "decided", page = 1) =>
    wrapCall<ServiceRequest[]>("GET", `${BASE}/approvals`, { state, page, limit: 20 }),
  detail: (id: string) => wrapCall<RequestDetail>("GET", `${BASE}/requests/${id}`),
  create: (payload: RequestPayload & { submit: boolean }) => wrapCall<ServiceRequest>("POST", `${BASE}/requests`, body(payload)),
  updateDraft: (id: string, payload: Partial<RequestPayload>) =>
    wrapCall<ServiceRequest>("PATCH", `${BASE}/requests/${id}`, body(payload)),
  submit: (id: string) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/submit`, {}),
  cancel: (id: string, reason: string | null) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/cancel`, { reason }),
  approve: (id: string, comment: string | null) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/approve`, { comment }),
  reject: (id: string, comment: string) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/reject`, { comment }),
  assign: (id: string, assigneeId: string | null) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/assign`, { assigneeId }),
  start: (id: string) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/start`, {}),
  fulfil: (id: string, note: string) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/fulfil`, { note }),
  comment: (id: string, text: string, internal: boolean) =>
    wrapCall<RequestComment>("POST", `${BASE}/requests/${id}/comments`, { body: text, internal }),
  askForInfo: (id: string, question: string) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/ask-info`, { question }),
  provideInfo: (id: string, answer: string) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/provide-info`, { answer }),

  // Attachments (images, PDF, Word, Excel)
  uploadAttachments: (id: string, files: File[]) =>
    uploadCall<RequestAttachment[]>(`${BASE}/requests/${id}/attachments`, files, "files"),
  deleteAttachment: (id: string, attachmentId: string) =>
    wrapCall<null>("DELETE", `${BASE}/requests/${id}/attachments/${attachmentId}`),

  // Service levels
  updateServiceLevels: (levels: ServiceLevels) =>
    wrapCall<ServiceDeskSettings>("PUT", `${BASE}/settings/service-levels`, body(levels)),

  // Approver groups and policies
  groups: () => wrapCall<ApproverGroup[]>("GET", `${BASE}/approver-groups`),
  createGroup: (payload: GroupPayload) => wrapCall<ApproverGroup>("POST", `${BASE}/approver-groups`, body(payload)),
  updateGroup: (id: string, payload: GroupPayload) => wrapCall<ApproverGroup>("PATCH", `${BASE}/approver-groups/${id}`, body(payload)),
  deleteGroup: (id: string) => wrapCall<null>("DELETE", `${BASE}/approver-groups/${id}`),
  policies: () => wrapCall<ApprovalPolicy[]>("GET", `${BASE}/policies`),
  createPolicy: (payload: PolicyPayload) => wrapCall<ApprovalPolicy>("POST", `${BASE}/policies`, body(payload)),
  updatePolicy: (id: string, payload: PolicyPayload) => wrapCall<ApprovalPolicy>("PATCH", `${BASE}/policies/${id}`, body(payload)),
  deletePolicy: (id: string) => wrapCall<null>("DELETE", `${BASE}/policies/${id}`),

  // Line managers
  managers: () => wrapCall<ManagerRow[]>("GET", `${BASE}/people/managers`),
  setManager: (userId: string, managerId: string | null) =>
    wrapCall<ManagerRow>("PUT", `${BASE}/people/${userId}/manager`, { managerId }),

  // My delegation
  delegateCandidates: () => wrapCall<Person[]>("GET", `${BASE}/people/delegates`),
  myDelegation: () => wrapCall<Delegation | null>("GET", `${BASE}/delegation`),
  setDelegation: (payload: { delegateId: string; startsOn: string; endsOn: string; note: string | null }) =>
    wrapCall<Delegation>("PUT", `${BASE}/delegation`, body(payload)),
  clearDelegation: () => wrapCall<null>("DELETE", `${BASE}/delegation`),

  // Reports
  reports: (range: { from?: string; to?: string }) => wrapCall<ServiceDeskReport>("GET", `${BASE}/reports`, body(range)),

  // Automation setup
  rules: () => wrapCall<AutomationRule[]>("GET", `${BASE}/automation/rules`),
  createRule: (payload: RulePayload) => wrapCall<AutomationRule>("POST", `${BASE}/automation/rules`, body(payload)),
  updateRule: (id: string, payload: RulePayload) => wrapCall<AutomationRule>("PATCH", `${BASE}/automation/rules/${id}`, body(payload)),
  deleteRule: (id: string) => wrapCall<null>("DELETE", `${BASE}/automation/rules/${id}`),
  dryRun: (conditions: RuleConditions, actions: RuleActions) =>
    wrapCall<DryRunResult>("POST", `${BASE}/automation/rules/dry-run`, { conditions, actions }),
  endpoints: () => wrapCall<WebhookEndpoint[]>("GET", `${BASE}/automation/endpoints`),
  createEndpoint: (payload: { name: string; url: string }) =>
    wrapCall<{ endpoint: WebhookEndpoint; secret: string }>("POST", `${BASE}/automation/endpoints`, payload),
  updateEndpoint: (id: string, payload: { name?: string; url?: string; isActive?: boolean }) =>
    wrapCall<WebhookEndpoint>("PATCH", `${BASE}/automation/endpoints/${id}`, payload),
  rotateEndpointSecret: (id: string) => wrapCall<{ secret: string }>("POST", `${BASE}/automation/endpoints/${id}/rotate-secret`, {}),
  testEndpoint: (id: string) =>
    wrapCall<{ ok: boolean; status: number; error: string | null; ms: number }>("POST", `${BASE}/automation/endpoints/${id}/test`, {}, { timeoutMs: 30_000 }),
  deleteEndpoint: (id: string) => wrapCall<null>("DELETE", `${BASE}/automation/endpoints/${id}`),
  runs: (params: { status?: RunStatus; kind?: RunKind; page?: number }) =>
    wrapCall<AutomationRunRow[]>("GET", `${BASE}/automation/runs`, body({ limit: 30, ...params })),

  // IT interventions
  runAutomation: (id: string) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/run-automation`, {}, { timeoutMs: 30_000 }),
  takeOver: (id: string) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/take-over`, {}),
  clearReview: (id: string) => wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/clear-review`, {}, { timeoutMs: 30_000 }),
  recordIdentityCheck: (id: string, method: string, note: string | null) =>
    wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/identity-check`, { method, note }, { timeoutMs: 30_000 }),

  // Self-service
  selfService: (itemId: string) => wrapCall<{ url: string }>("POST", `${BASE}/catalog/items/${itemId}/self-service`, {}),

  // AI — the model can take a while (the server allows 90 s plus a retry).
  aiIntake: (description: string) =>
    wrapCall<IntakeSuggestion>("POST", `${BASE}/ai/intake`, { description }, { timeoutMs: AI_TIMEOUT }),
  aiTriage: (id: string) => wrapCall<AiTriage>("POST", `${BASE}/requests/${id}/ai-triage`, {}, { timeoutMs: AI_TIMEOUT }),
}

const AI_TIMEOUT = 200_000

export interface GroupPayload {
  name?: string
  description?: string | null
  maxRiskLevel?: RiskLevel
  memberIds?: string[]
}

export interface PolicyPayload {
  name?: string
  description?: string | null
  steps?: PolicyStep[]
}

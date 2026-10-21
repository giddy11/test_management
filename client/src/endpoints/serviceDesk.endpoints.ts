// endpoints/serviceDesk.endpoints.ts — IT requests (/api/v1/service-desk).
import { uploadCall, uploadFilesWithFields, wrapCall } from "@/transport/http"
import type {
  AiTriage,
  ApprovalRulesPatch,
  IntakeSuggestion,
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
  MessagePayload,
  Person,
  PortalCategory,
  RequestComment,
  RequestDetail,
  RequestPayload,
  ServiceDeskCounts,
  ServiceDeskSettings,
  ServiceRequest,
  SubmissionCheck,
} from "@/types/serviceDesk.types"

const BASE = "/api/v1/service-desk"
const body = (v: object) => v as unknown as Record<string, unknown>

export const ServiceDeskEndpoints = {
  // Settings
  settings: () => wrapCall<ServiceDeskSettings>("GET", `${BASE}/settings`),
  updateSettings: (enabled: boolean) => wrapCall<ServiceDeskSettings>("PUT", `${BASE}/settings`, { enabled }),
  updateApprovalRules: (rules: ApprovalRulesPatch) =>
    wrapCall<ServiceDeskSettings>("PUT", `${BASE}/settings/approvals`, rules),

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
  checkSubmission: (itemId: string, requestedForId?: string) =>
    wrapCall<SubmissionCheck>("GET", `${BASE}/requests/check`, { itemId, ...(requestedForId ? { requestedForId } : {}) }),
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
  // A message: sent as form data so it can carry files; the server also accepts plain JSON.
  comment: (id: string, m: MessagePayload) =>
    uploadFilesWithFields<RequestComment>(
      `${BASE}/requests/${id}/comments`,
      m.files ?? [],
      {
        body: m.body,
        internal: String(m.internal),
        ...(m.parentId ? { parentId: m.parentId } : {}),
        mentionIds: JSON.stringify(m.mentionIds),
      },
      "files"
    ),
  editComment: (id: string, commentId: string, p: { body: string; mentionIds: string[] }) =>
    wrapCall<RequestComment>("PATCH", `${BASE}/requests/${id}/comments/${commentId}`, p),
  deleteComment: (id: string, commentId: string) =>
    wrapCall<null>("DELETE", `${BASE}/requests/${id}/comments/${commentId}`),
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

  // How IT confirmed who is asking
  recordIdentityCheck: (id: string, method: string, note: string | null) =>
    wrapCall<ServiceRequest>("POST", `${BASE}/requests/${id}/identity-check`, { method, note }, { timeoutMs: 30_000 }),

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

// endpoints/serviceDesk.endpoints.ts — IT requests (/api/v1/service-desk).
import { wrapCall } from "@/transport/http"
import type {
  AdminCategory,
  AdminItem,
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
}

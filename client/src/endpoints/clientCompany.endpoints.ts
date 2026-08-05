// endpoints/clientCompany.endpoints.ts
import { wrapCall } from "@/transport/http"
import type {
  ClientCompany,
  CreateClientCompanyPayload,
  CreateSupporterPayload,
  Supporter,
  UpdateClientCompanyPayload,
} from "@/types/clientCompany.types"

export const ClientCompanyEndpoints = {
  // Self-service — an IT supporter's own company (support portal).
  fetchMine: () => wrapCall<ClientCompany>("GET", "/api/v1/client-companies/me"),

  fetchAll: (projectId: string) =>
    wrapCall<ClientCompany[]>("GET", "/api/v1/client-companies", { projectId }),

  create: (payload: CreateClientCompanyPayload) =>
    wrapCall<ClientCompany>("POST", "/api/v1/client-companies", payload as unknown as Record<string, unknown>),

  update: (id: string, payload: UpdateClientCompanyPayload) =>
    wrapCall<ClientCompany>("PATCH", `/api/v1/client-companies/${id}`, payload as unknown as Record<string, unknown>),

  remove: (id: string) =>
    wrapCall<null>("DELETE", `/api/v1/client-companies/${id}`),

  setLink: (id: string, enabled: boolean) =>
    wrapCall<{ feedbackToken: string | null }>("POST", `/api/v1/client-companies/${id}/link`, { enabled }),

  // Self-service — the company's own IT support lead only (no admin fallback).
  setAutoAssign: (id: string, enabled: boolean) =>
    wrapCall<ClientCompany>("PATCH", `/api/v1/client-companies/${id}/auto-assign`, { enabled }),

  listSupporters: (id: string) =>
    wrapCall<Supporter[]>("GET", `/api/v1/client-companies/${id}/supporters`),

  createSupporter: (id: string, payload: CreateSupporterPayload) =>
    wrapCall<Supporter>("POST", `/api/v1/client-companies/${id}/supporters`, payload as unknown as Record<string, unknown>),

  removeSupporter: (id: string, userId: string) =>
    wrapCall<null>("DELETE", `/api/v1/client-companies/${id}/supporters/${userId}`),

  setSupporterLead: (id: string, userId: string, isSupportLead: boolean) =>
    wrapCall<Supporter>("PATCH", `/api/v1/client-companies/${id}/supporters/${userId}/lead`, {
      isSupportLead,
    }),
}

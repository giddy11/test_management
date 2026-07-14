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

  listSupporters: (id: string) =>
    wrapCall<Supporter[]>("GET", `/api/v1/client-companies/${id}/supporters`),

  createSupporter: (id: string, payload: CreateSupporterPayload) =>
    wrapCall<Supporter>("POST", `/api/v1/client-companies/${id}/supporters`, payload as unknown as Record<string, unknown>),

  removeSupporter: (id: string, userId: string) =>
    wrapCall<null>("DELETE", `/api/v1/client-companies/${id}/supporters/${userId}`),
}

// endpoints/ticketLink.endpoints.ts
import { wrapCall } from "@/transport/http"
import type {
  CreatedTicketLink,
  CreateTicketLinkPayload,
  SimilarTicket,
  TicketLinks,
  TicketLinkSummary,
  TicketType,
} from "@/types/ticketLink.types"

const obj = (p: unknown) => p as Record<string, unknown>

export const TicketLinkEndpoints = {
  // Everything on one ticket's page: its occurrences, and what it's related to.
  fetch: (type: TicketType, id: string) =>
    wrapCall<TicketLinks>("GET", "/api/v1/ticket-links", { type, id }),

  // Badge data for a page of one list, keyed by ticket id.
  summary: (projectId: string, type: TicketType, ids: string[]) =>
    wrapCall<Record<string, TicketLinkSummary>>("GET", "/api/v1/ticket-links/summary", {
      projectId,
      type,
      ids: ids.join(","),
    }),

  // "Has this been raised before?" — past tickets that read like `title`.
  similar: (params: { projectId: string; title: string; excludeType?: TicketType; excludeId?: string }) =>
    wrapCall<SimilarTicket[]>("GET", "/api/v1/ticket-links/similar", obj(params)),

  // The link picker's search — by title, or a pasted reference code.
  candidates: (params: { projectId: string; q: string; excludeType?: TicketType; excludeId?: string }) =>
    wrapCall<SimilarTicket[]>("GET", "/api/v1/ticket-links/candidates", obj(params)),

  create: (payload: CreateTicketLinkPayload) =>
    wrapCall<CreatedTicketLink>("POST", "/api/v1/ticket-links", obj(payload)),

  remove: (linkId: string) => wrapCall<null>("DELETE", `/api/v1/ticket-links/${linkId}`),
}

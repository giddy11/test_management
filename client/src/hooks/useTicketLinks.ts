// hooks/useTicketLinks.ts — React Query bridge for linking tickets to one another
// and finding tickets that have been raised before.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { TicketLinkEndpoints } from "@/endpoints/ticketLink.endpoints"
import { ApiError } from "@/transport/http"
import { CANDIDATE_MIN_LENGTH, SIMILAR_MIN_LENGTH } from "@/lib/ticketLinks"
import type {
  CreatedTicketLink,
  CreateTicketLinkPayload,
  PendingTicketLink,
  TicketType,
} from "@/types/ticketLink.types"

export const TICKET_LINKS_KEY = "ticket-links"

interface ExcludedTicket {
  type: TicketType
  id: string
}

// Everything on one ticket's page.
export function useTicketLinks(type: TicketType, id: string) {
  return useQuery({
    queryKey: [TICKET_LINKS_KEY, "detail", type, id],
    queryFn: async () => {
      const res = await TicketLinkEndpoints.fetch(type, id)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(id),
  })
}

// Badge data for the tickets on screen, keyed by ticket id — a ticket missing
// from the map has nothing to show.
export function useTicketLinkSummary(projectId: string, type: TicketType, ids: string[]) {
  return useQuery({
    queryKey: [TICKET_LINKS_KEY, "summary", projectId, type, ids.join(",")],
    queryFn: async () => {
      const res = await TicketLinkEndpoints.summary(projectId, type, ids)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? {}
    },
    enabled: Boolean(projectId) && ids.length > 0,
    // Keep the previous page's badges on screen while the next page's load.
    placeholderData: keepPreviousData,
  })
}

// Past tickets whose title reads like `title`. `title` is expected to be
// debounced by the caller — the query key changes with every distinct value.
export function useSimilarTickets(
  projectId: string,
  title: string,
  exclude?: ExcludedTicket,
  enabled = true
) {
  const trimmed = title.replace(/\s+/g, " ").trim()
  return useQuery({
    queryKey: [TICKET_LINKS_KEY, "similar", projectId, trimmed, exclude?.type ?? null, exclude?.id ?? null],
    queryFn: async () => {
      const res = await TicketLinkEndpoints.similar({
        projectId,
        title: trimmed,
        excludeType: exclude?.type,
        excludeId: exclude?.id,
      })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: enabled && Boolean(projectId) && trimmed.length >= SIMILAR_MIN_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

// The link picker's search. `q` is expected to be debounced by the caller.
export function useTicketCandidates(projectId: string, q: string, exclude?: ExcludedTicket) {
  const trimmed = q.trim()
  return useQuery({
    queryKey: [TICKET_LINKS_KEY, "candidates", projectId, trimmed, exclude?.type ?? null, exclude?.id ?? null],
    queryFn: async () => {
      const res = await TicketLinkEndpoints.candidates({
        projectId,
        q: trimmed,
        excludeType: exclude?.type,
        excludeId: exclude?.id,
      })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(projectId) && trimmed.length >= CANDIDATE_MIN_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

// Any change to a link moves counts everywhere — a ticket's page, the badges on
// the lists, and the "raised N times" beside a suggestion — so drop them all.
export function useCreateTicketLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateTicketLinkPayload): Promise<CreatedTicketLink> => {
      const res = await TicketLinkEndpoints.create(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TICKET_LINKS_KEY] }),
  })
}

export function useDeleteTicketLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (linkId: string) => {
      const res = await TicketLinkEndpoints.remove(linkId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [TICKET_LINKS_KEY] }),
  })
}

// Makes the links picked while a ticket was being written, once it exists.
// Repeats go first, so a problem that turns out to be already recorded is caught
// before the looser "related" links are added. One failing doesn't stop the rest;
// the number that failed is returned so the caller can say so.
export function useLinkPendingTickets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      source,
      pending,
    }: {
      source: { type: TicketType; id: string }
      pending: PendingTicketLink[]
    }): Promise<{ failed: number }> => {
      const ordered = [...pending].sort(
        (a, b) => Number(b.linkType === "duplicate") - Number(a.linkType === "duplicate")
      )
      let failed = 0
      for (const p of ordered) {
        const res = await TicketLinkEndpoints.create({
          sourceType: source.type,
          sourceId: source.id,
          targetType: p.ticket.type,
          targetId: p.ticket.id,
          linkType: p.linkType,
        })
        if (!res.success) failed++
      }
      return { failed }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [TICKET_LINKS_KEY] }),
  })
}

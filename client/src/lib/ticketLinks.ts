// lib/ticketLinks.ts — small helpers shared by the ticket-link components.
import type { TicketRef, TicketType } from "@/types/ticketLink.types"

// Below this a title is too short to say anything about — mirrors the server.
export const SIMILAR_MIN_LENGTH = 4
export const CANDIDATE_MIN_LENGTH = 2

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  bug: "Bug",
  feature_request: "Feature request",
  feedback: "Ticket",
}

// Where a ticket opens. Bugs and feature requests have their own page; a
// feedback ticket only exists as a row in the project's Tickets tab, which opens
// its manage dialog when given the reference code (see FeedbackTab).
export function ticketPath(t: Pick<TicketRef, "type" | "id" | "projectId" | "referenceCode">): string {
  switch (t.type) {
    case "bug":
      return `/projects/${t.projectId}/bugs/${t.id}`
    case "feature_request":
      return `/projects/${t.projectId}/feature-requests/${t.id}`
    case "feedback":
      return `/projects/${t.projectId}?tab=feedback&ticket=${encodeURIComponent(t.referenceCode)}`
  }
}

export const ticketKey = (t: { type: TicketType; id: string }) => `${t.type}:${t.id}`

// types/ticketLink.types.ts — mirrors the backend ticketLink DTOs.

// The three kinds of ticket that can be linked to one another.
export type TicketType = "bug" | "feature_request" | "feedback"

// `duplicate` reads "the source is a repeat of the target (the original)";
// `related` has no direction.
export type TicketLinkType = "related" | "duplicate"

export interface TicketRef {
  type: TicketType
  id: string
  projectId: string
  // "BF-…", "FR-…" or "TKT-…"
  referenceCode: string
  title: string
  // The ticket's own status string — see TicketStatusBadge for how it's shown.
  status: string
  // A feedback ticket's own kind (bug / feature_request / complaint), else null.
  feedbackType: string | null
  createdAt: string
}

// One link as seen from the ticket whose page it is on: `ticket` is the OTHER end.
export interface LinkedTicket {
  linkId: string
  linkType: TicketLinkType
  ticket: TicketRef
  linkedAt: string
  linkedBy: string | null
}

// One member of a group of tickets that are all the same problem.
export interface Occurrence {
  ticket: TicketRef
  // The duplicate link that makes this ticket a repeat — null for the original.
  linkId: string | null
  isOriginal: boolean
  // True for the ticket whose page this is.
  isCurrent: boolean
}

export interface TicketLinks {
  ticket: TicketRef
  // How many times this problem has been raised, counting the original.
  occurrenceCount: number
  // Set when THIS ticket is a repeat of an earlier one.
  duplicateOf: LinkedTicket | null
  // The original plus every repeat, original first. Empty when occurrenceCount is 1.
  occurrences: Occurrence[]
  related: LinkedTicket[]
}

// What a list page needs per ticket to draw its badge.
export interface TicketLinkSummary {
  // Repeats recorded against this ticket (so it was raised duplicateCount + 1 times).
  duplicateCount: number
  // This ticket is itself a repeat of another.
  isDuplicate: boolean
  relatedCount: number
}

// A past ticket whose title reads like one being typed, or a picker result.
export interface SimilarTicket extends TicketRef {
  // 0–1, how closely the title matched.
  score: number
  // How many times this problem has been raised (1 if never repeated).
  occurrenceCount: number
}

export interface CreateTicketLinkPayload {
  sourceType: TicketType
  sourceId: string
  targetType: TicketType
  targetId: string
  linkType: TicketLinkType
}

export interface CreatedTicketLink {
  link: LinkedTicket
  // Set when the ticket picked as the original was itself a repeat of an earlier
  // one — the link went to that earlier one instead. This is the ticket picked.
  redirectedFrom: TicketRef | null
}

// A link chosen while a ticket is still being written, made once it exists.
export interface PendingTicketLink {
  ticket: SimilarTicket
  // From the NEW ticket's point of view: "duplicate" = it is a repeat of `ticket`.
  linkType: TicketLinkType
}

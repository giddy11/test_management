// modules/ticketLink/dto/ticketLink.dto.ts
import type { TicketRef, TicketMatch, LinkRow } from "../repositories/ticketLink.repository";
import type { TicketType, TicketLinkKind } from "../entities/ticketLink.entity";

const { formatReferenceCode } = require("../../../shared/utils/referenceCode");

// The prefixes each type's reference code is built from — the same ones
// bug.dto, featureRequest.dto and feedback.dto use, so a code shown here pastes
// straight into the picker or a list search.
const CODE_PREFIX: Record<TicketType, string> = {
  bug: "BF",
  feature_request: "FR",
  feedback: "TKT",
};

export function referenceCodeFor(ref: Pick<TicketRef, "type" | "number" | "createdAt">): string {
  return formatReferenceCode(CODE_PREFIX[ref.type], ref.number, ref.createdAt);
}

export interface TicketRefResponse {
  type: TicketType;
  id: string;
  projectId: string;
  referenceCode: string;
  title: string;
  // The ticket's own status string — the client formats it per type.
  status: string;
  // A feedback ticket's own kind (bug / feature_request / complaint), else null.
  feedbackType: string | null;
  createdAt: Date;
}

export function toTicketRefResponse(ref: TicketRef): TicketRefResponse {
  return {
    type: ref.type,
    id: ref.id,
    projectId: ref.projectId,
    referenceCode: referenceCodeFor(ref),
    title: ref.title,
    status: ref.status,
    feedbackType: ref.feedbackType,
    createdAt: ref.createdAt,
  };
}

// One link, seen from the ticket whose page it is on: `ticket` is the OTHER end.
export interface LinkedTicketResponse {
  linkId: string;
  linkType: TicketLinkKind;
  ticket: TicketRefResponse;
  linkedAt: Date;
  linkedBy: string | null;
}

export function toLinkedTicketResponse(link: LinkRow, other: TicketRef): LinkedTicketResponse {
  return {
    linkId: link.id,
    linkType: link.linkType,
    ticket: toTicketRefResponse(other),
    linkedAt: link.createdAt,
    linkedBy: link.createdByName,
  };
}

// One member of a group of tickets that are all the same problem.
export interface OccurrenceResponse {
  ticket: TicketRefResponse;
  // The duplicate link that makes this ticket a repeat — null for the original.
  linkId: string | null;
  isOriginal: boolean;
  // True for the ticket whose page this is.
  isCurrent: boolean;
}

export interface TicketLinksResponse {
  ticket: TicketRefResponse;
  // How many times this problem has been raised, counting the original: 1 when
  // nothing has been recorded as a repeat of it.
  occurrenceCount: number;
  // Set when THIS ticket is a repeat of an earlier one.
  duplicateOf: LinkedTicketResponse | null;
  // The original plus every repeat, original first. Empty when occurrenceCount is 1.
  occurrences: OccurrenceResponse[];
  related: LinkedTicketResponse[];
}

// What a list page needs per ticket to draw its badge.
export interface TicketLinkSummaryResponse {
  // Repeats recorded against this ticket (so it was raised duplicateCount + 1 times).
  duplicateCount: number;
  // This ticket is itself a repeat of another.
  isDuplicate: boolean;
  relatedCount: number;
}

export interface SimilarTicketResponse extends TicketRefResponse {
  // 0–1, how closely the title reads like the one that was typed.
  score: number;
  // How many times this problem has been raised (1 if never repeated).
  occurrenceCount: number;
}

export function toSimilarTicketResponse(
  match: TicketMatch,
  occurrenceCount: number
): SimilarTicketResponse {
  return {
    ...toTicketRefResponse(match),
    score: Math.round(match.score * 100) / 100,
    occurrenceCount,
  };
}

export interface CreatedLinkResponse {
  link: LinkedTicketResponse;
  // Set when the ticket the caller picked as the original was itself a repeat of
  // an earlier one — the link went to that earlier one instead, so the count
  // stays on a single original. This is the ticket that was picked.
  redirectedFrom: TicketRefResponse | null;
}

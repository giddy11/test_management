// modules/search/services/search.service.ts
import { SearchRepository } from "../repositories/search.repository";
import type { SearchRow } from "../repositories/search.repository";
import type { Actor } from "../../../shared/types/actor";

const { AppError } = require("../../../shared/errors/AppError");
const { parseReferenceCode } = require("../../../shared/utils/referenceCode");
const {
  restrictToOwnWorkOrNull,
  isExternalSupporter,
  isOrphanedSupporter,
} = require("../../../shared/access/scope");

// Below two characters a "search" is really a request for everything, which is
// both useless to read and the one shape of this query that cannot use an index.
const MIN_TERM_LENGTH = 2;
const MAX_LIMIT = 50;

export class SearchService {
  static Instance = new SearchService();

  searchRepo: SearchRepository;

  constructor(searchRepo = SearchRepository.Instance) {
    this.searchRepo = searchRepo;
  }

  // One list, ranked, across everything the actor may open.
  //
  // The access rule is not re-implemented here: the repository anchors every
  // result to the same set of accessible projects the project list uses, and
  // the route's project.read is what keeps principals with no business in the
  // product surface (an external company's IT supporters) out entirely. What
  // this method owns is the two decisions that need the actor: which
  // organisation to search, and whether to restrict to their own projects.
  async search(actor: Actor, params: { q: string; limit?: number }): Promise<SearchRow[]> {
    // A supporter works their company's queue, which has its own screens and
    // its own scoping; they have no project surface to search. Denied here as
    // well as at the route, the same way FeedbackService.fetchFeedback does.
    if (isExternalSupporter(actor) || isOrphanedSupporter(actor)) {
      throw new AppError("Global search is not available for support accounts", 403);
    }
    // No organisation means no accessible projects. Returning nothing is the
    // honest answer and avoids an unscoped query.
    if (!actor.organizationId) return [];

    const term = params.q.trim();
    if (term.length < MIN_TERM_LENGTH) return [];

    return this.searchRepo.search({
      organizationId: actor.organizationId,
      restrictedUserId: restrictToOwnWorkOrNull(actor),
      term,
      limit: Math.min(params.limit ?? 20, MAX_LIMIT),
      // A pasted reference code ("BF-20260728-014") should find that one
      // record, not the 14 whose titles happen to contain "14".
      bugNumber: parseReferenceCode("BF", term),
      ticketNumber: parseReferenceCode("TKT", term),
    });
  }
}

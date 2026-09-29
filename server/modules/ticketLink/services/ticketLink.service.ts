// modules/ticketLink/services/ticketLink.service.ts
//
// Relating tickets to one another — and answering "has this been raised before?".
//
// A ticket here is a bug, a feature request or a feedback ticket. Two tickets of
// the same project can be linked as:
//   related    — they touch the same thing; no direction.
//   duplicate  — the source is a REPEAT of the target (the original). This is what
//                turns "the sign-up button is broken again" into a count: the
//                original's page shows every time the problem has been raised.
//
// Access is the project's, exactly as it is for the tickets themselves: reading
// links needs access to the project, adding or removing one needs to be able to
// contribute to it. Feedback tickets still in a client company's IT queue are
// invisible here, the same as everywhere else in the product organisation.
import { TicketLinkRepository } from "../repositories/ticketLink.repository";
import type { LinkRow, TicketKey, TicketRef } from "../repositories/ticketLink.repository";
import type { TicketType, TicketLinkKind } from "../entities/ticketLink.entity";
import {
  referenceCodeFor,
  toLinkedTicketResponse,
  toSimilarTicketResponse,
  toTicketRefResponse,
} from "../dto/ticketLink.dto";
import type {
  CreatedLinkResponse,
  LinkedTicketResponse,
  OccurrenceResponse,
  SimilarTicketResponse,
  TicketLinkSummaryResponse,
  TicketLinksResponse,
} from "../dto/ticketLink.dto";
import { ProjectService } from "../../project/services/project.service";
import type { Actor } from "../../../shared/types/actor";

const { AppError } = require("../../../shared/errors/AppError");
const { ActivityService } = require("../../activity/services/activity.service");
const { parseReferenceCode } = require("../../../shared/utils/referenceCode");

// Below this a title is too short to say anything about — "Bug" matches half the
// tracker. The picker's own floor is lower because there the user is typing a
// deliberate search.
const MIN_SIMILAR_LENGTH = 4;
const MIN_CANDIDATE_LENGTH = 2;
const SIMILAR_LIMIT = 5;
const CANDIDATE_LIMIT = 10;
// Whole-title similarity, or the typed text sitting (almost) inside a stored
// title. Tuned for titles: shorter than that and unrelated tickets start to match.
const MIN_SIMILARITY = 0.3;
const MIN_WORD_SIMILARITY = 0.7;
// How far up a chain of "repeat of" links to follow before giving up. A chain is
// normally one hop; this only guards against a cycle that should never exist.
const MAX_CHAIN_HOPS = 10;

const keyOf = (type: TicketType, id: string) => `${type}:${id}`;
const sourceKey = (l: LinkRow): TicketKey => ({ type: l.sourceType, id: l.sourceId });
const targetKey = (l: LinkRow): TicketKey => ({ type: l.targetType, id: l.targetId });
const sameKey = (a: TicketKey, b: TicketKey) => a.type === b.type && a.id === b.id;

// What the activity log says a ticket is called.
const labelOf = (ref: TicketRef) => `${referenceCodeFor(ref)} "${ref.title}"`;

interface Summary {
  duplicateCount: number;
  // The original this ticket is a repeat of, when it is one and that original is visible.
  duplicateOf: TicketKey | null;
  relatedCount: number;
}

export interface CreateLinkInput {
  sourceType: TicketType;
  sourceId: string;
  targetType: TicketType;
  targetId: string;
  linkType: TicketLinkKind;
}

export class TicketLinkService {
  static Instance = new TicketLinkService();

  constructor(
    private linkRepo: TicketLinkRepository = TicketLinkRepository.Instance,
    private projectService: ProjectService = ProjectService.Instance
  ) {}

  // The ticket, 404 if it is gone or not visible, then the project access check —
  // the same "check access via the parent" pattern as BugService.getAccessible.
  private async getAccessibleTicket(actor: Actor, key: TicketKey): Promise<TicketRef> {
    const [ref] = await this.linkRepo.resolveTickets([key]);
    if (!ref) throw new AppError("Ticket not found", 404);
    await this.projectService.getProject(actor, ref.projectId);
    return ref;
  }

  // ── Reading ─────────────────────────────────────────────────────────────────

  // Everything the ticket's page shows: the group of occurrences it belongs to,
  // and the tickets related to it.
  async getLinks(actor: Actor, key: TicketKey): Promise<TicketLinksResponse> {
    const ticket = await this.getAccessibleTicket(actor, key);
    const links = await this.linkRepo.findInvolving(key);

    const isDuplicate = (l: LinkRow) => l.linkType === "duplicate";
    const originalLink = links.find((l) => isDuplicate(l) && sameKey(sourceKey(l), key)) ?? null;
    const repeatLinks = links.filter((l) => isDuplicate(l) && sameKey(targetKey(l), key));
    const relatedLinks = links.filter((l) => !isDuplicate(l));

    // A repeat's siblings are the original's other repeats — one more query, and
    // only for a ticket that is itself a repeat.
    const siblingLinks = originalLink
      ? (await this.linkRepo.findDuplicatesOf(targetKey(originalLink))).filter(
          (l) => l.id !== originalLink.id
        )
      : [];

    // Every other ticket we are about to name, resolved in one go. A ticket that
    // was deleted (or is not visible) resolves to nothing and drops out.
    const wanted: TicketKey[] = [];
    if (originalLink) wanted.push(targetKey(originalLink));
    for (const l of repeatLinks) wanted.push(sourceKey(l));
    for (const l of siblingLinks) wanted.push(sourceKey(l));
    for (const l of relatedLinks) {
      wanted.push(sameKey(sourceKey(l), key) ? targetKey(l) : sourceKey(l));
    }
    const resolved = await this.linkRepo.resolveTickets(wanted);
    const refs = new Map(resolved.map((r) => [keyOf(r.type, r.id), r]));
    const refOf = (k: TicketKey) => refs.get(keyOf(k.type, k.id)) ?? null;

    const original = originalLink ? refOf(targetKey(originalLink)) : null;
    const duplicateOf =
      originalLink && original ? toLinkedTicketResponse(originalLink, original) : null;

    // The group: the original first, then every repeat — this ticket among them
    // when it is one — oldest first. If the original has since been deleted the
    // repeats are still each other's siblings, so the group is just them.
    const repeatEntries = (
      originalLink
        ? [
            { ref: ticket as TicketRef | null, linkId: originalLink.id },
            ...siblingLinks.map((l) => ({ ref: refOf(sourceKey(l)), linkId: l.id })),
          ]
        : repeatLinks.map((l) => ({ ref: refOf(sourceKey(l)), linkId: l.id }))
    )
      .filter((e): e is { ref: TicketRef; linkId: string } => e.ref !== null)
      .sort((x, y) => x.ref.createdAt.getTime() - y.ref.createdAt.getTime());
    const head = originalLink
      ? original
        ? [{ ref: original, linkId: null as string | null, isOriginal: true }]
        : []
      : [{ ref: ticket, linkId: null as string | null, isOriginal: true }];
    const members = [
      ...head,
      ...repeatEntries.map((e) => ({ ref: e.ref, linkId: e.linkId as string | null, isOriginal: false })),
    ];

    const occurrences: OccurrenceResponse[] =
      members.length > 1
        ? members.map((m) => ({
            ticket: toTicketRefResponse(m.ref),
            linkId: m.linkId,
            isOriginal: m.isOriginal,
            isCurrent: sameKey(m.ref, key),
          }))
        : [];

    const related: LinkedTicketResponse[] = [];
    for (const l of relatedLinks) {
      const other = refOf(sameKey(sourceKey(l), key) ? targetKey(l) : sourceKey(l));
      if (other) related.push(toLinkedTicketResponse(l, other));
    }

    return {
      ticket: toTicketRefResponse(ticket),
      occurrenceCount: Math.max(members.length, 1),
      duplicateOf,
      occurrences,
      related,
    };
  }

  // Per-ticket counts for a page of one list — the "Reported 3×" / "Duplicate"
  // badges. Only tickets with something to show appear in the result.
  async getSummary(
    actor: Actor,
    params: { projectId: string; type: TicketType; ids: string[] }
  ): Promise<Record<string, TicketLinkSummaryResponse>> {
    await this.projectService.getProject(actor, params.projectId);
    const keys = params.ids.map((id) => ({ type: params.type, id }));
    const summaries = await this.summarise(params.projectId, keys);

    const result: Record<string, TicketLinkSummaryResponse> = {};
    for (const [k, s] of summaries) {
      if (s.duplicateCount === 0 && s.relatedCount === 0 && !s.duplicateOf) continue;
      result[k.slice(k.indexOf(":") + 1)] = {
        duplicateCount: s.duplicateCount,
        isDuplicate: s.duplicateOf !== null,
        relatedCount: s.relatedCount,
      };
    }
    return result;
  }

  // Counts of repeats / related tickets for each key, ignoring anything whose
  // other end has been deleted or is not visible.
  private async summarise(projectId: string, keys: TicketKey[]): Promise<Map<string, Summary>> {
    const links = await this.linkRepo.findInvolvingMany(projectId, keys);
    const mine = new Set(keys.map((k) => keyOf(k.type, k.id)));

    // Each link contributes to whichever of its ends is one of ours.
    const sides = links.flatMap((l) => {
      const src = sourceKey(l);
      const tgt = targetKey(l);
      const out: { self: TicketKey; other: TicketKey; link: LinkRow; selfIsSource: boolean }[] = [];
      if (mine.has(keyOf(src.type, src.id))) out.push({ self: src, other: tgt, link: l, selfIsSource: true });
      if (mine.has(keyOf(tgt.type, tgt.id))) out.push({ self: tgt, other: src, link: l, selfIsSource: false });
      return out;
    });

    const visible = new Set(
      (await this.linkRepo.resolveTickets(sides.map((s) => s.other))).map((r) => keyOf(r.type, r.id))
    );

    const result = new Map<string, Summary>(
      keys.map((k) => [keyOf(k.type, k.id), { duplicateCount: 0, duplicateOf: null, relatedCount: 0 }])
    );
    for (const { self, other, link, selfIsSource } of sides) {
      if (!visible.has(keyOf(other.type, other.id))) continue;
      const s = result.get(keyOf(self.type, self.id))!;
      if (link.linkType === "related") s.relatedCount++;
      else if (selfIsSource) s.duplicateOf = other;
      else s.duplicateCount++;
    }
    return result;
  }

  // Past tickets whose title reads like `title` — shown while a new ticket is
  // being written, and on an existing one to spot repeats nobody linked. Best
  // match first, each with how many times it has been raised. A repeat is left
  // out when its original is in the list too: the original carries the count.
  async findSimilar(
    actor: Actor,
    params: { projectId: string; title: string; excludeType?: TicketType; excludeId?: string }
  ): Promise<SimilarTicketResponse[]> {
    await this.projectService.getProject(actor, params.projectId);
    const title = params.title.replace(/\s+/g, " ").trim();
    if (title.length < MIN_SIMILAR_LENGTH) return [];

    const matches = await this.linkRepo.findSimilar({
      projectId: params.projectId,
      title,
      exclude: this.excludeOf(params),
      minSimilarity: MIN_SIMILARITY,
      minWordSimilarity: MIN_WORD_SIMILARITY,
      limit: SIMILAR_LIMIT,
    });
    if (matches.length === 0) return [];

    const summaries = await this.summarise(
      params.projectId,
      matches.map((m) => ({ type: m.type, id: m.id }))
    );
    const listed = new Set(matches.map((m) => keyOf(m.type, m.id)));

    return matches
      .filter((m) => {
        const original = summaries.get(keyOf(m.type, m.id))?.duplicateOf;
        return !(original && listed.has(keyOf(original.type, original.id)));
      })
      .map((m) =>
        toSimilarTicketResponse(m, 1 + (summaries.get(keyOf(m.type, m.id))?.duplicateCount ?? 0))
      );
  }

  // The link picker's search — by title, or by a pasted reference code.
  async searchCandidates(
    actor: Actor,
    params: { projectId: string; q: string; excludeType?: TicketType; excludeId?: string }
  ): Promise<SimilarTicketResponse[]> {
    await this.projectService.getProject(actor, params.projectId);
    const term = params.q.trim();
    if (term.length < MIN_CANDIDATE_LENGTH) return [];

    const matches = await this.linkRepo.searchCandidates({
      projectId: params.projectId,
      term,
      exclude: this.excludeOf(params),
      // A pasted reference code ("BF-20260728-014") should find that one ticket,
      // not the 14 whose titles happen to contain "14".
      bugNumber: parseReferenceCode("BF", term),
      requestNumber: parseReferenceCode("FR", term),
      ticketNumber: parseReferenceCode("TKT", term),
      limit: CANDIDATE_LIMIT,
    });
    if (matches.length === 0) return [];

    const summaries = await this.summarise(
      params.projectId,
      matches.map((m) => ({ type: m.type, id: m.id }))
    );
    return matches.map((m) =>
      toSimilarTicketResponse(m, 1 + (summaries.get(keyOf(m.type, m.id))?.duplicateCount ?? 0))
    );
  }

  private excludeOf(p: { excludeType?: TicketType; excludeId?: string }): TicketKey | null {
    return p.excludeType && p.excludeId ? { type: p.excludeType, id: p.excludeId } : null;
  }

  // ── Writing ─────────────────────────────────────────────────────────────────

  async createLink(actor: Actor, input: CreateLinkInput): Promise<CreatedLinkResponse> {
    const source: TicketKey = { type: input.sourceType, id: input.sourceId };
    const picked: TicketKey = { type: input.targetType, id: input.targetId };
    if (sameKey(source, picked)) throw new AppError("A ticket can't be linked to itself", 422);

    const resolved = await this.linkRepo.resolveTickets([source, picked]);
    const sourceRef = resolved.find((r) => sameKey(r, source));
    const pickedRef = resolved.find((r) => sameKey(r, picked));
    if (!sourceRef || !pickedRef) throw new AppError("Ticket not found", 404);
    if (sourceRef.projectId !== pickedRef.projectId) {
      throw new AppError("Tickets can only be linked within the same project", 422);
    }

    const projectId = sourceRef.projectId;
    await this.projectService.getProject(actor, projectId);
    // Linking is taking part in the project, like reporting a bug: a read-only
    // viewer can see every link but not add one.
    await this.projectService.assertCanContribute(actor, projectId);

    let targetRef = pickedRef;
    let linkSource = sourceRef;
    if (input.linkType === "duplicate") {
      targetRef = await this.resolveOriginal(pickedRef);
      await this.assertCanBeRepeat(sourceRef, targetRef);
    } else if (keyOf(sourceRef.type, sourceRef.id) > keyOf(targetRef.type, targetRef.id)) {
      // `related` has no direction, so the pair is stored in one canonical order
      // and the pair index then covers both ways round.
      [linkSource, targetRef] = [targetRef, sourceRef];
    }

    const existing = await this.linkRepo.findBetween(linkSource, targetRef);
    if (existing) {
      throw new AppError(
        existing.linkType === "duplicate"
          ? "These tickets are already linked as a repeat of one another"
          : "These tickets are already linked as related",
        409
      );
    }

    const link = await this.linkRepo.create({
      projectId,
      sourceType: linkSource.type,
      sourceId: linkSource.id,
      targetType: targetRef.type,
      targetId: targetRef.id,
      linkType: input.linkType,
      createdById: actor.id,
    });

    ActivityService.Instance.log(actor, {
      action: "ticket.linked",
      summary:
        input.linkType === "duplicate"
          ? `Marked ${labelOf(sourceRef)} as a repeat of ${labelOf(targetRef)}`
          : `Linked ${labelOf(sourceRef)} to ${labelOf(targetRef)} as related`,
      entityType: sourceRef.type,
      entityId: sourceRef.id,
      metadata: {
        projectId,
        linkType: input.linkType,
        source: { type: sourceRef.type, id: sourceRef.id },
        target: { type: targetRef.type, id: targetRef.id },
      },
    });

    // Reported from the ticket the caller was on — the other end is whichever
    // one is not the source, whichever way round `related` was stored.
    const other = sameKey(linkSource, source) ? targetRef : linkSource;
    const { firstName, lastName } = actor as Actor & { firstName?: string; lastName?: string | null };
    const row: LinkRow = {
      ...link,
      createdByName: [firstName, lastName].filter(Boolean).join(" ") || null,
    };
    return {
      link: toLinkedTicketResponse(row, other),
      redirectedFrom:
        input.linkType === "duplicate" && !sameKey(targetRef, pickedRef)
          ? toTicketRefResponse(pickedRef)
          : null,
    };
  }

  // A repeat always points at the ORIGINAL, never at another repeat: if the ticket
  // the caller picked is itself a repeat, follow it up so the count lands on one
  // ticket instead of splitting across a chain.
  private async resolveOriginal(start: TicketRef): Promise<TicketRef> {
    let current = start;
    const seen = new Set([keyOf(current.type, current.id)]);
    for (let hop = 0; hop < MAX_CHAIN_HOPS; hop++) {
      const up = await this.linkRepo.findOriginalLink(current);
      if (!up) return current;
      const next = targetKey(up);
      if (seen.has(keyOf(next.type, next.id))) return current; // a cycle — stop here
      const [ref] = await this.linkRepo.resolveTickets([next]);
      if (!ref) return current; // the original was deleted — this one stands in
      seen.add(keyOf(ref.type, ref.id));
      current = ref;
    }
    return current;
  }

  private async assertCanBeRepeat(source: TicketRef, original: TicketRef): Promise<void> {
    if (sameKey(source, original)) {
      // The ticket picked as the original is itself a repeat of this one.
      throw new AppError(
        `${referenceCodeFor(source)} is the original of this problem, so it can't be marked as a repeat of one of its own repeats`,
        422
      );
    }
    const alreadyRepeat = await this.linkRepo.findOriginalLink(source);
    if (alreadyRepeat) {
      throw new AppError(
        `${referenceCodeFor(source)} is already marked as a repeat of another ticket — remove that link first`,
        409
      );
    }
    const repeats = await this.linkRepo.findDuplicatesOf(source);
    if (repeats.length > 0) {
      throw new AppError(
        `${referenceCodeFor(source)} has ${repeats.length} repeat${repeats.length === 1 ? "" : "s"} recorded against it, so it can't itself be marked as a repeat. Mark ${referenceCodeFor(original)} as the repeat instead, or remove those links first`,
        422
      );
    }
  }

  async deleteLink(actor: Actor, id: string): Promise<void> {
    const link = await this.linkRepo.findById(id);
    if (!link) throw new AppError("Link not found", 404);
    await this.projectService.getProject(actor, link.projectId);
    await this.projectService.assertCanContribute(actor, link.projectId);
    // Whoever added a link can take it back; anyone else needs to manage the project.
    if (link.createdById !== actor.id && !(await this.projectService.canManageProject(actor, link.projectId))) {
      throw new AppError("Only whoever added this link, or the project's team lead, can remove it", 403);
    }

    await this.linkRepo.delete(id);

    const refs = await this.linkRepo.resolveTickets([sourceKey(link), targetKey(link)]);
    const src = refs.find((r) => sameKey(r, sourceKey(link)));
    const tgt = refs.find((r) => sameKey(r, targetKey(link)));
    ActivityService.Instance.log(actor, {
      action: "ticket.unlinked",
      summary:
        src && tgt
          ? `Removed the ${link.linkType === "duplicate" ? "repeat" : "related"} link between ${labelOf(src)} and ${labelOf(tgt)}`
          : "Removed a link between two tickets",
      entityType: link.sourceType,
      entityId: link.sourceId,
      metadata: {
        projectId: link.projectId,
        linkType: link.linkType,
        source: { type: link.sourceType, id: link.sourceId },
        target: { type: link.targetType, id: link.targetId },
      },
    });
  }
}

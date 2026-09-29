// modules/ticketLink/tests/ticketLink.service.spec.js
const { TicketLinkService } = require("../services/ticketLink.service");
const { ActivityService } = require("../../activity/services/activity.service");
const { permissionsFor } = require("../../../test/actors");

// The audit log is fire-and-forget and has its own spec; here it is only asserted
// on, never written.
jest.mock("../../activity/services/activity.service", () => ({
  ActivityService: { Instance: { log: jest.fn() } },
}));

const admin = { id: "admin-1", role: "admin", permissions: permissionsFor("admin"), organizationId: "org-1" };
const member = { id: "user-1", role: "user", permissions: permissionsFor("user"), organizationId: "org-1" };
const otherMember = { id: "user-2", role: "user", permissions: permissionsFor("user"), organizationId: "org-1" };

const ticket = (type, id, number, createdAt, overrides = {}) => ({
  type,
  id,
  projectId: "proj-1",
  title: overrides.title ?? `${type} ${id}`,
  status: overrides.status ?? "Open",
  number,
  feedbackType: type === "feedback" ? "bug" : null,
  createdAt: new Date(createdAt),
  ...overrides,
});

// The scenario from the feature request: the sign-up bug was reported in March,
// fixed, and then reported again in September.
const oldBug = ticket("bug", "bug-old", 14, "2026-03-01T09:00:00Z", { title: "Sign up button not working", status: "Fixed" });
const newBug = ticket("bug", "bug-new", 89, "2026-09-28T09:00:00Z", { title: "Sign up button not working" });
const thirdBug = ticket("bug", "bug-third", 95, "2026-09-29T09:00:00Z");
const featureRequest = ticket("feature_request", "fr-1", 3, "2026-05-01T09:00:00Z");
const feedbackTicket = ticket("feedback", "fb-1", 7, "2026-06-01T09:00:00Z");
const foreignBug = ticket("bug", "bug-x", 200, "2026-09-01T09:00:00Z", { projectId: "proj-2" });

const link = (id, source, target, linkType, extra = {}) => ({
  id,
  projectId: "proj-1",
  sourceType: source.type,
  sourceId: source.id,
  targetType: target.type,
  targetId: target.id,
  linkType,
  createdById: "user-1",
  createdAt: new Date("2026-09-28T10:00:00Z"),
  createdByName: "Uche Tester",
  ...extra,
});

// A small in-memory stand-in for the repository, so the rules under test (which
// ticket a link lands on, what counts as a repeat) run against real data shapes.
function makeLinkRepo({ tickets = [], links = [] } = {}) {
  const state = { tickets, links };
  const is = (a, b) => a.type === b.type && a.id === b.id;
  const src = (l) => ({ type: l.sourceType, id: l.sourceId });
  const tgt = (l) => ({ type: l.targetType, id: l.targetId });
  return {
    state,
    resolveTickets: jest.fn(async (keys) => state.tickets.filter((t) => keys.some((k) => is(k, t)))),
    findById: jest.fn(async (id) => state.links.find((l) => l.id === id) ?? null),
    findInvolving: jest.fn(async (key) => state.links.filter((l) => is(src(l), key) || is(tgt(l), key))),
    findInvolvingMany: jest.fn(async (projectId, keys) =>
      state.links.filter((l) => l.projectId === projectId && keys.some((k) => is(src(l), k) || is(tgt(l), k)))
    ),
    findDuplicatesOf: jest.fn(async (key) => state.links.filter((l) => l.linkType === "duplicate" && is(tgt(l), key))),
    findOriginalLink: jest.fn(async (key) => state.links.find((l) => l.linkType === "duplicate" && is(src(l), key)) ?? null),
    findBetween: jest.fn(
      async (a, b) =>
        state.links.find((l) => (is(src(l), a) && is(tgt(l), b)) || (is(src(l), b) && is(tgt(l), a))) ?? null
    ),
    create: jest.fn(async (data) => ({ id: "link-new", createdAt: new Date("2026-09-30T09:00:00Z"), ...data })),
    delete: jest.fn().mockResolvedValue(undefined),
    findSimilar: jest.fn().mockResolvedValue([]),
    searchCandidates: jest.fn().mockResolvedValue([]),
  };
}

function makeProjectService() {
  return {
    getProject: jest.fn().mockResolvedValue({ id: "proj-1", organizationId: "org-1" }),
    // Same default as the bug spec: admins manage, plain users don't.
    canManageProject: jest.fn().mockImplementation(async (actor) => actor.role !== "user"),
    assertCanContribute: jest.fn().mockResolvedValue(undefined),
  };
}

const allTickets = [oldBug, newBug, thirdBug, featureRequest, feedbackTicket, foreignBug];
const key = (t) => ({ type: t.type, id: t.id });

describe("TicketLinkService", () => {
  let linkRepo;
  let projectService;
  let service;

  const build = (links = []) => {
    linkRepo = makeLinkRepo({ tickets: allTickets, links });
    projectService = makeProjectService();
    service = new TicketLinkService(linkRepo, projectService);
  };

  beforeEach(() => build());

  describe("createLink — repeats", () => {
    it("records the new report as a repeat of the old one", async () => {
      const res = await service.createLink(member, {
        sourceType: "bug", sourceId: "bug-new", targetType: "bug", targetId: "bug-old", linkType: "duplicate",
      });

      expect(linkRepo.create).toHaveBeenCalledWith({
        projectId: "proj-1",
        sourceType: "bug", sourceId: "bug-new",
        targetType: "bug", targetId: "bug-old",
        linkType: "duplicate",
        createdById: "user-1",
      });
      // Seen from the new bug's page, the other end is the original.
      expect(res.link.ticket.id).toBe("bug-old");
      expect(res.redirectedFrom).toBeNull();
    });

    it("points at the ORIGINAL when the ticket picked is itself a repeat", async () => {
      build([link("l1", newBug, oldBug, "duplicate")]);

      const res = await service.createLink(member, {
        sourceType: "bug", sourceId: "bug-third", targetType: "bug", targetId: "bug-new", linkType: "duplicate",
      });

      // Landing on bug-old keeps the count on one ticket instead of a chain.
      expect(linkRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: "bug", targetId: "bug-old" })
      );
      expect(res.link.ticket.id).toBe("bug-old");
      expect(res.redirectedFrom).toEqual(expect.objectContaining({ id: "bug-new" }));
    });

    it("writes an audit entry naming both tickets", async () => {
      await service.createLink(member, {
        sourceType: "bug", sourceId: "bug-new", targetType: "bug", targetId: "bug-old", linkType: "duplicate",
      });
      expect(ActivityService.Instance.log).toHaveBeenCalledWith(
        member,
        expect.objectContaining({
          action: "ticket.linked",
          entityType: "bug",
          entityId: "bug-new",
          summary: expect.stringMatching(/as a repeat of BF-20260301-014/),
        })
      );
    });

    it("can mark a feedback ticket as a repeat of a bug (across types)", async () => {
      await service.createLink(member, {
        sourceType: "feedback", sourceId: "fb-1", targetType: "bug", targetId: "bug-old", linkType: "duplicate",
      });
      expect(linkRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: "feedback", targetType: "bug", linkType: "duplicate" })
      );
    });

    it("refuses when the ticket is already a repeat of another", async () => {
      build([link("l1", newBug, oldBug, "duplicate")]);
      await expect(
        service.createLink(member, {
          sourceType: "bug", sourceId: "bug-new", targetType: "bug", targetId: "bug-third", linkType: "duplicate",
        })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(linkRepo.create).not.toHaveBeenCalled();
    });

    it("refuses to make an original a repeat while it has repeats of its own", async () => {
      build([link("l1", newBug, oldBug, "duplicate")]);
      await expect(
        service.createLink(member, {
          sourceType: "bug", sourceId: "bug-old", targetType: "bug", targetId: "bug-third", linkType: "duplicate",
        })
      ).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining("1 repeat") });
      expect(linkRepo.create).not.toHaveBeenCalled();
    });

    it("refuses to mark an original as a repeat of its own repeat", async () => {
      build([link("l1", newBug, oldBug, "duplicate")]);
      await expect(
        service.createLink(member, {
          sourceType: "bug", sourceId: "bug-old", targetType: "bug", targetId: "bug-new", linkType: "duplicate",
        })
      ).rejects.toMatchObject({ statusCode: 422 });
    });
  });

  describe("createLink — related", () => {
    it("stores the pair in one canonical order whichever way round it is added", async () => {
      // "bug:…" sorts before "feature_request:…", so the bug is always the source.
      const forward = await service.createLink(member, {
        sourceType: "bug", sourceId: "bug-new", targetType: "feature_request", targetId: "fr-1", linkType: "related",
      });
      const backward = await service.createLink(member, {
        sourceType: "feature_request", sourceId: "fr-1", targetType: "bug", targetId: "bug-new", linkType: "related",
      });

      for (const call of linkRepo.create.mock.calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({ sourceType: "bug", sourceId: "bug-new", targetType: "feature_request", targetId: "fr-1" })
        );
      }
      // Each caller still sees the ticket they linked TO, not themselves.
      expect(forward.link.ticket.id).toBe("fr-1");
      expect(backward.link.ticket.id).toBe("bug-new");
    });
  });

  describe("createLink — guards", () => {
    const dup = (over = {}) => ({
      sourceType: "bug", sourceId: "bug-new", targetType: "bug", targetId: "bug-old", linkType: "duplicate", ...over,
    });

    it("rejects linking a ticket to itself", async () => {
      await expect(service.createLink(member, dup({ targetId: "bug-new" }))).rejects.toMatchObject({ statusCode: 422 });
    });

    it("404s when either ticket is missing or not visible", async () => {
      await expect(service.createLink(member, dup({ targetId: "does-not-exist" }))).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.createLink(member, dup({ sourceId: "does-not-exist" }))).rejects.toMatchObject({ statusCode: 404 });
    });

    it("only links tickets of the same project", async () => {
      await expect(service.createLink(member, dup({ targetId: "bug-x" }))).rejects.toMatchObject({ statusCode: 422 });
      expect(linkRepo.create).not.toHaveBeenCalled();
    });

    it("409s when the two tickets are already linked, in either direction", async () => {
      build([link("l1", oldBug, featureRequest, "related")]);
      await expect(
        service.createLink(member, {
          sourceType: "feature_request", sourceId: "fr-1", targetType: "bug", targetId: "bug-old", linkType: "related",
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("checks project access and that the actor can contribute", async () => {
      await service.createLink(member, dup());
      expect(projectService.getProject).toHaveBeenCalledWith(member, "proj-1");
      expect(projectService.assertCanContribute).toHaveBeenCalledWith(member, "proj-1");
    });

    it("stops a read-only viewer from linking", async () => {
      projectService.assertCanContribute.mockRejectedValue(
        Object.assign(new Error("You have read-only access to this project"), { statusCode: 403 })
      );
      await expect(service.createLink(member, dup())).rejects.toMatchObject({ statusCode: 403 });
      expect(linkRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("getLinks — how many times has it been raised?", () => {
    it("counts the original plus every repeat, original first", async () => {
      build([link("l1", newBug, oldBug, "duplicate"), link("l2", thirdBug, oldBug, "duplicate")]);

      const res = await service.getLinks(member, key(oldBug));

      expect(res.occurrenceCount).toBe(3);
      expect(res.duplicateOf).toBeNull();
      expect(res.occurrences.map((o) => o.ticket.id)).toEqual(["bug-old", "bug-new", "bug-third"]);
      expect(res.occurrences.map((o) => o.isOriginal)).toEqual([true, false, false]);
      expect(res.occurrences.map((o) => o.isCurrent)).toEqual([true, false, false]);
      expect(res.occurrences.map((o) => o.linkId)).toEqual([null, "l1", "l2"]);
    });

    it("shows a repeat the whole group, and which ticket is the original", async () => {
      build([link("l1", newBug, oldBug, "duplicate"), link("l2", thirdBug, oldBug, "duplicate")]);

      const res = await service.getLinks(member, key(newBug));

      expect(res.duplicateOf.ticket.id).toBe("bug-old");
      expect(res.occurrenceCount).toBe(3);
      expect(res.occurrences.map((o) => o.ticket.id)).toEqual(["bug-old", "bug-new", "bug-third"]);
      expect(res.occurrences.find((o) => o.isCurrent).ticket.id).toBe("bug-new");
    });

    it("reports 1 occurrence and no group for a ticket nothing repeats", async () => {
      const res = await service.getLinks(member, key(oldBug));
      expect(res.occurrenceCount).toBe(1);
      expect(res.occurrences).toEqual([]);
      expect(res.duplicateOf).toBeNull();
    });

    it("lists related tickets separately, from either end of the link", async () => {
      build([link("l1", oldBug, featureRequest, "related"), link("l2", feedbackTicket, oldBug, "related")]);

      const res = await service.getLinks(member, key(oldBug));

      expect(res.related.map((r) => r.ticket.id).sort()).toEqual(["fb-1", "fr-1"]);
      expect(res.related[0].linkedBy).toBe("Uche Tester");
      expect(res.occurrenceCount).toBe(1);
    });

    it("leaves out tickets that have since been deleted", async () => {
      build([link("l1", newBug, oldBug, "duplicate"), link("l2", thirdBug, oldBug, "duplicate")]);
      linkRepo.state.tickets = allTickets.filter((t) => t.id !== "bug-third");

      const res = await service.getLinks(member, key(oldBug));

      expect(res.occurrenceCount).toBe(2);
      expect(res.occurrences.map((o) => o.ticket.id)).toEqual(["bug-old", "bug-new"]);
    });

    it("404s for a ticket that does not exist", async () => {
      await expect(service.getLinks(member, { type: "bug", id: "nope" })).rejects.toMatchObject({ statusCode: 404 });
    });

    it("checks the actor can open the ticket's project", async () => {
      projectService.getProject.mockRejectedValue(
        Object.assign(new Error("You do not have access to this project"), { statusCode: 403 })
      );
      await expect(service.getLinks(member, key(oldBug))).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("getSummary", () => {
    it("gives each ticket its repeat count and whether it is itself a repeat", async () => {
      build([
        link("l1", newBug, oldBug, "duplicate"),
        link("l2", thirdBug, oldBug, "duplicate"),
        link("l3", oldBug, featureRequest, "related"),
      ]);

      const res = await service.getSummary(member, {
        projectId: "proj-1", type: "bug", ids: ["bug-old", "bug-new", "bug-third"],
      });

      expect(res["bug-old"]).toEqual({ duplicateCount: 2, isDuplicate: false, relatedCount: 1 });
      expect(res["bug-new"]).toEqual({ duplicateCount: 0, isDuplicate: true, relatedCount: 0 });
      expect(res["bug-third"]).toEqual({ duplicateCount: 0, isDuplicate: true, relatedCount: 0 });
    });

    it("omits tickets with nothing to show, and ignores deleted counterparts", async () => {
      build([link("l1", newBug, oldBug, "duplicate")]);
      linkRepo.state.tickets = allTickets.filter((t) => t.id !== "bug-new");

      const res = await service.getSummary(member, {
        projectId: "proj-1", type: "bug", ids: ["bug-old", "bug-third"],
      });

      expect(res).toEqual({});
    });
  });

  describe("findSimilar — has this been raised before?", () => {
    const match = (t, score) => ({ ...t, score });

    it("does not search on a title too short to mean anything", async () => {
      expect(await service.findSimilar(member, { projectId: "proj-1", title: "  ab " })).toEqual([]);
      expect(linkRepo.findSimilar).not.toHaveBeenCalled();
    });

    it("finds the earlier report and says how many times it has been raised", async () => {
      build([link("l1", newBug, oldBug, "duplicate")]);
      linkRepo.findSimilar.mockResolvedValue([match(oldBug, 0.83)]);

      const res = await service.findSimilar(member, { projectId: "proj-1", title: "Sign  up   button broken" });

      // Whitespace is collapsed before searching.
      expect(linkRepo.findSimilar).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "proj-1", title: "Sign up button broken", exclude: null })
      );
      expect(res).toHaveLength(1);
      expect(res[0]).toEqual(expect.objectContaining({ id: "bug-old", score: 0.83, occurrenceCount: 2 }));
    });

    it("lists an original instead of its repeat when both match", async () => {
      build([link("l1", newBug, oldBug, "duplicate")]);
      linkRepo.findSimilar.mockResolvedValue([match(newBug, 0.9), match(oldBug, 0.8)]);

      const res = await service.findSimilar(member, { projectId: "proj-1", title: "Sign up button" });

      expect(res.map((r) => r.id)).toEqual(["bug-old"]);
    });

    it("keeps a repeat whose original did not match", async () => {
      build([link("l1", newBug, oldBug, "duplicate")]);
      linkRepo.findSimilar.mockResolvedValue([match(newBug, 0.9)]);

      const res = await service.findSimilar(member, { projectId: "proj-1", title: "Sign up button" });

      expect(res.map((r) => r.id)).toEqual(["bug-new"]);
    });

    it("leaves the ticket being looked at out of its own results", async () => {
      await service.findSimilar(member, {
        projectId: "proj-1", title: "Sign up button", excludeType: "bug", excludeId: "bug-new",
      });
      expect(linkRepo.findSimilar).toHaveBeenCalledWith(
        expect.objectContaining({ exclude: { type: "bug", id: "bug-new" } })
      );
    });

    it("needs access to the project", async () => {
      projectService.getProject.mockRejectedValue(
        Object.assign(new Error("You do not have access to this project"), { statusCode: 403 })
      );
      await expect(
        service.findSimilar(member, { projectId: "proj-1", title: "Sign up button" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(linkRepo.findSimilar).not.toHaveBeenCalled();
    });
  });

  describe("searchCandidates — the link picker", () => {
    it("does not search on a single character", async () => {
      expect(await service.searchCandidates(member, { projectId: "proj-1", q: "b" })).toEqual([]);
      expect(linkRepo.searchCandidates).not.toHaveBeenCalled();
    });

    it("turns a pasted reference code into an exact-number lookup", async () => {
      await service.searchCandidates(member, { projectId: "proj-1", q: "BF-20260301-014" });
      expect(linkRepo.searchCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ bugNumber: 14, requestNumber: null, ticketNumber: null })
      );

      await service.searchCandidates(member, { projectId: "proj-1", q: "FR-3" });
      expect(linkRepo.searchCandidates).toHaveBeenLastCalledWith(
        expect.objectContaining({ bugNumber: null, requestNumber: 3, ticketNumber: null })
      );

      await service.searchCandidates(member, { projectId: "proj-1", q: "TKT-20260601-007" });
      expect(linkRepo.searchCandidates).toHaveBeenLastCalledWith(
        expect.objectContaining({ bugNumber: null, requestNumber: null, ticketNumber: 7 })
      );
    });

    it("treats ordinary text as a title search", async () => {
      await service.searchCandidates(member, { projectId: "proj-1", q: "sign up" });
      expect(linkRepo.searchCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ term: "sign up", bugNumber: null, requestNumber: null, ticketNumber: null })
      );
    });
  });

  describe("deleteLink", () => {
    beforeEach(() => build([link("l1", newBug, oldBug, "duplicate", { createdById: "user-1" })]));

    it("lets whoever added the link remove it, and logs it", async () => {
      await service.deleteLink(member, "l1");
      expect(linkRepo.delete).toHaveBeenCalledWith("l1");
      expect(ActivityService.Instance.log).toHaveBeenCalledWith(
        member,
        expect.objectContaining({ action: "ticket.unlinked", entityType: "bug", entityId: "bug-new" })
      );
    });

    it("lets a project manager remove someone else's link", async () => {
      await service.deleteLink(admin, "l1");
      expect(linkRepo.delete).toHaveBeenCalledWith("l1");
    });

    it("stops another plain member removing it", async () => {
      await expect(service.deleteLink(otherMember, "l1")).rejects.toMatchObject({ statusCode: 403 });
      expect(linkRepo.delete).not.toHaveBeenCalled();
    });

    it("404s for a link that does not exist", async () => {
      await expect(service.deleteLink(member, "missing")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("checks project access", async () => {
      projectService.getProject.mockRejectedValue(
        Object.assign(new Error("You do not have access to this project"), { statusCode: 403 })
      );
      await expect(service.deleteLink(member, "l1")).rejects.toMatchObject({ statusCode: 403 });
      expect(linkRepo.delete).not.toHaveBeenCalled();
    });
  });
});

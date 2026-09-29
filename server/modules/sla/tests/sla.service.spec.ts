// modules/sla/tests/sla.service.spec.ts
// SlaService: permission → scope narrowing, default rules merging, compliance-rate
// maths, settings access, and the drill-down's "can the product org open
// this ticket" flag. The SQL itself lives in the repository (mocked here).

import { DEFAULT_SLA_TARGETS, SlaService, pickInterval } from "../services/sla.service";

const { actorFor } = require("../../../test/actors");

const emptyKpis = {
  total: 0, tickets: 0, bugs: 0, featureRequests: 0, resolved: 0, closed: 0, open: 0,
  awaitingResponse: 0, responded: 0, avgFirstResponseMs: null, medianFirstResponseMs: null,
  avgResolutionMs: null, medianResolutionMs: null, firstResponseMet: 0, firstResponseBreached: 0,
  resolutionMet: 0, resolutionBreached: 0, slaMet: 0, slaBreached: 0, slaPending: 0,
  avgWaitingMs: null, oldestWaitingMs: null, totalPausedMs: null, avgRating: null, ratingCount: 0,
};

function makeRepo() {
  return {
    findSettings: jest.fn().mockResolvedValue(null),
    saveSettings: jest.fn().mockImplementation((data) => Promise.resolve({ ...data, updatedAt: new Date() })),
    kpis: jest.fn().mockResolvedValue({ ...emptyKpis }),
    overTime: jest.fn().mockResolvedValue([]),
    bySeverity: jest.fn().mockResolvedValue([]),
    byStage: jest.fn().mockResolvedValue([]),
    byType: jest.fn().mockResolvedValue([]),
    bySource: jest.fn().mockResolvedValue([]),
    byProject: jest.fn().mockResolvedValue([]),
    byAssignee: jest.fn().mockResolvedValue([]),
    bySupporter: jest.fn().mockResolvedValue([]),
    recurring: jest.fn().mockResolvedValue([]),
    tickets: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    filterOptions: jest.fn().mockResolvedValue({ projects: [], companies: [], assignees: [], supporters: [] }),
  };
}

// Actors carry the permission set their role resolves to; the service scopes
// on those rather than on the role name.
const admin = actorFor("admin", { id: "admin-1" });
const superadmin = actorFor("superadmin", { id: "sa-1", organizationId: "org-sa" });
const user = actorFor("user", { id: "user-1" });
const supporter = actorFor("it_support", {
  id: "sup-1",
  clientCompanyId: "cc-1",
  isSupportLead: false,
});

describe("SlaService.overview — scope per role", () => {
  it("admins see their whole organisation", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).overview(admin, {});
    expect(repo.kpis).toHaveBeenCalledWith({ organizationId: "org-1" }, expect.anything(), expect.anything());
  });

  it("superadmins are scoped to their own org like any admin", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).overview(superadmin, {});
    expect(repo.kpis.mock.calls[0][0]).toEqual({ organizationId: "org-sa" });
  });

  it("plain users (QA) are narrowed to projects they're members of", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).overview(user, {});
    expect(repo.kpis.mock.calls[0][0]).toEqual({ organizationId: "org-1", memberUserId: "user-1" });
  });

  it("IT supporters see only their own company, and can't widen it via the filter", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).overview(supporter, { clientCompanyId: "cc-other" });
    const [scope, filters] = repo.kpis.mock.calls[0];
    expect(scope).toEqual({ clientCompanyId: "cc-1" });
    expect(filters.clientCompanyId).toBeUndefined();
  });

  it("rejects a supporter with no company on their account", async () => {
    const repo = makeRepo();
    await expect(
      new SlaService(repo as any).overview({ ...supporter, clientCompanyId: null }, {})
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("passes ticket filters through and strips presentation-only params", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).overview(admin, {
      from: "2026-01-01",
      to: "2026-01-31",
      severity: "high",
      type: "bug",
      assigneeId: "u-2",
      interval: "week",
    });
    const [, filters] = repo.kpis.mock.calls[0];
    expect(filters).toEqual({ from: "2026-01-01", to: "2026-01-31", severity: "high", type: "bug", assigneeId: "u-2" });
    expect(repo.overTime).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), "week");
  });
});

describe("SlaService.overview — recurring issues", () => {
  it("returns the ranked groups with pg's numeric strings turned into numbers", async () => {
    const repo = makeRepo();
    repo.recurring.mockResolvedValue([
      {
        groupKey: "bug:b-1",
        source: "bug",
        title: "Sign up button not working",
        count: 3,
        afterFix: 2,
        votes: null,
        // bigint aggregates arrive from pg as strings.
        avgResolutionMs: "7200000",
        linked: true,
      },
      { groupKey: "feature_request:f-1", source: "feature_request", title: "Dark mode", count: 4, votes: "23", linked: true },
    ]);

    const { recurring } = await new SlaService(repo as any).overview(admin, {});

    expect(recurring[0]).toMatchObject({ groupKey: "bug:b-1", avgResolutionMs: 7200000, afterFix: 2, votes: null });
    expect(recurring[1]).toMatchObject({ source: "feature_request", votes: 23 });
  });

  it("asks for the groups within the caller's own scope and filters", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).overview(user, { projectId: "p-1" });
    // The plain user's scope is what keeps groups to projects they belong to.
    expect(repo.recurring).toHaveBeenCalledWith(
      { organizationId: "org-1", memberUserId: "user-1" },
      { projectId: "p-1" },
      expect.anything()
    );
  });

  it("hands an IT supporter the company scope, which is what withholds link-based groups", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).overview(supporter, {});
    expect(repo.recurring.mock.calls[0][0]).toEqual({ clientCompanyId: "cc-1" });
  });
});

describe("SlaService — rules", () => {
  it("uses the code defaults when the org has no saved rules", async () => {
    const repo = makeRepo();
    const result = await new SlaService(repo as any).overview(admin, {});
    const [, , rules] = repo.kpis.mock.calls[0];
    expect(rules.targets).toEqual(DEFAULT_SLA_TARGETS);
    expect(rules.pausedStatuses).toEqual([]);
    expect(result.rules.isDefault).toBe(true);
  });

  it("merges a saved row over the defaults so every severity key is present", async () => {
    const repo = makeRepo();
    repo.findSettings.mockResolvedValue({
      organizationId: "org-1",
      targets: { critical: { firstResponseHours: 0.5, resolutionHours: 8 } },
      pausedStatuses: ["resolved"],
      updatedAt: new Date(),
    });
    await new SlaService(repo as any).overview(admin, {});
    const [, , rules] = repo.kpis.mock.calls[0];
    expect(rules.targets.critical).toEqual({ firstResponseHours: 0.5, resolutionHours: 8 });
    expect(rules.targets.default).toEqual(DEFAULT_SLA_TARGETS.default);
    expect(rules.pausedStatuses).toEqual(["resolved"]);
  });

  it("only admins may edit; supporters and users read the org's rules", async () => {
    const repo = makeRepo();
    const service = new SlaService(repo as any);
    expect((await service.getSettings(admin)).canEdit).toBe(true);
    expect((await service.getSettings(user)).canEdit).toBe(false);
    expect((await service.getSettings(supporter)).canEdit).toBe(false);
  });

  it("saves rules against the admin's organisation, de-duplicating paused stages", async () => {
    const repo = makeRepo();
    const body = {
      targets: DEFAULT_SLA_TARGETS,
      pausedStatuses: ["resolved", "resolved", "acknowledged"],
    };
    const result = await new SlaService(repo as any).updateSettings(admin, body as any);
    expect(repo.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", pausedStatuses: ["resolved", "acknowledged"], updatedById: "admin-1" })
    );
    expect(result.isDefault).toBe(false);
  });
});

describe("SlaService — per-source targets", () => {
  const bugTargets = {
    critical: { firstResponseHours: 8, resolutionHours: 48 },
    high: { firstResponseHours: 24, resolutionHours: 120 },
    medium: { firstResponseHours: 48, resolutionHours: 240 },
    low: { firstResponseHours: 72, resolutionHours: 480 },
  };

  it("bugs and feature requests follow the ticket targets until configured", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).overview(admin, {});
    const [, , rules] = repo.kpis.mock.calls[0];
    expect(rules.bugTargets).toEqual(DEFAULT_SLA_TARGETS);
    expect(rules.featureRequestTarget).toEqual(DEFAULT_SLA_TARGETS.default);
  });

  it("uses the saved bug targets, keeping the ticket 'default' key so the SQL never hits a null", async () => {
    const repo = makeRepo();
    repo.findSettings.mockResolvedValue({
      organizationId: "org-1",
      targets: DEFAULT_SLA_TARGETS,
      bugTargets,
      featureRequestTarget: { firstResponseHours: 72, resolutionHours: 720 },
      pausedStatuses: [],
      updatedAt: new Date(),
    });
    await new SlaService(repo as any).overview(admin, {});
    const [, , rules] = repo.kpis.mock.calls[0];
    expect(rules.bugTargets.critical).toEqual(bugTargets.critical);
    expect(rules.bugTargets.default).toEqual(DEFAULT_SLA_TARGETS.default);
    expect(rules.targets).toEqual(DEFAULT_SLA_TARGETS);
    expect(rules.featureRequestTarget).toEqual({ firstResponseHours: 72, resolutionHours: 720 });
  });

  it("reports whether bugs / feature requests have their own targets", async () => {
    const repo = makeRepo();
    const service = new SlaService(repo as any);
    const followed = await service.getSettings(admin);
    expect(followed.separateBugTargets).toBe(false);
    expect(followed.separateFeatureRequestTarget).toBe(false);

    repo.findSettings.mockResolvedValue({
      organizationId: "org-1",
      targets: DEFAULT_SLA_TARGETS,
      bugTargets,
      featureRequestTarget: null,
      pausedStatuses: [],
      updatedAt: new Date(),
    });
    const custom = await service.getSettings(admin);
    expect(custom.separateBugTargets).toBe(true);
    expect(custom.separateFeatureRequestTarget).toBe(false);
  });

  it("saves the per-source targets, and clears them when the body sends null", async () => {
    const repo = makeRepo();
    const service = new SlaService(repo as any);
    await service.updateSettings(admin, {
      targets: DEFAULT_SLA_TARGETS,
      bugTargets,
      featureRequestTarget: { firstResponseHours: 72, resolutionHours: 720 },
      pausedStatuses: [],
    } as any);
    expect(repo.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ bugTargets, featureRequestTarget: { firstResponseHours: 72, resolutionHours: 720 } })
    );

    const cleared = await service.updateSettings(admin, {
      targets: DEFAULT_SLA_TARGETS,
      bugTargets: null,
      featureRequestTarget: null,
      pausedStatuses: [],
    } as any);
    expect(repo.saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ bugTargets: null, featureRequestTarget: null })
    );
    expect(cleared.separateBugTargets).toBe(false);
    expect(cleared.bugTargets).toEqual(DEFAULT_SLA_TARGETS);
  });
});

describe("SlaService.overview — compliance rates", () => {
  it("computes rates over judged tickets only, null when nothing is judged", async () => {
    const repo = makeRepo();
    repo.kpis.mockResolvedValue({
      ...emptyKpis,
      total: 10,
      firstResponseMet: 3,
      firstResponseBreached: 1,
      resolutionMet: 2,
      resolutionBreached: 2,
      slaMet: 2,
      slaBreached: 3,
      slaPending: 5,
      // pg returns bigint aggregates as strings — they must come back as numbers.
      avgResolutionMs: "7200000",
    });
    const { kpis } = await new SlaService(repo as any).overview(admin, {});
    expect(kpis.firstResponseRate).toBe(75);
    expect(kpis.resolutionRate).toBe(50);
    expect(kpis.complianceRate).toBe(40);
    expect(kpis.avgResolutionMs).toBe(7_200_000);

    repo.kpis.mockResolvedValue({ ...emptyKpis });
    const fresh = await new SlaService(repo as any).overview(admin, {});
    expect(fresh.kpis.complianceRate).toBeNull();
  });

  it("orders the severity breakdown critical → low → unset", async () => {
    const repo = makeRepo();
    repo.bySeverity.mockResolvedValue([
      { severity: "unset", total: 1 },
      { severity: "low", total: 1 },
      { severity: "critical", total: 1 },
    ]);
    const { bySeverity } = await new SlaService(repo as any).overview(admin, {});
    expect(bySeverity.map((r: { severity: string }) => r.severity)).toEqual(["critical", "low", "unset"]);
  });
});

describe("SlaService.tickets — drill-down", () => {
  it("flags company tickets still in the IT queue as not openable by the product org", async () => {
    const repo = makeRepo();
    repo.tickets.mockResolvedValue({
      data: [
        { id: "a", clientCompanyId: null, supportStatus: null, assignees: null },
        { id: "b", clientCompanyId: "cc-1", supportStatus: "investigating", assignees: ["Ann"] },
        { id: "c", clientCompanyId: "cc-1", supportStatus: "escalated", assignees: [] },
      ],
      meta: {},
    });
    const { data } = await new SlaService(repo as any).tickets(admin, { metric: "all", sort: "newest", page: 1, limit: 20 } as any);
    expect(data.map((t: { visibleInTriage: boolean }) => t.visibleInTriage)).toEqual([true, false, true]);
    expect(data[0].assignees).toEqual([]);
  });

  it("keeps the group key, so a row of 'Most recurring issues' opens exactly its own reports", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).tickets(admin, {
      metric: "all", sort: "newest", page: 1, limit: 20, recurringKey: "bug:b-1", projectId: "p-1",
    } as any);
    expect(repo.tickets).toHaveBeenCalledWith(
      { organizationId: "org-1" },
      { projectId: "p-1", recurringKey: "bug:b-1" },
      expect.anything(),
      expect.anything()
    );
  });

  it("forwards metric/sort/paging to the repository", async () => {
    const repo = makeRepo();
    await new SlaService(repo as any).tickets(supporter, { metric: "breached", sort: "longest_waiting", page: 2, limit: 10 } as any);
    expect(repo.tickets).toHaveBeenCalledWith(
      { clientCompanyId: "cc-1" },
      expect.anything(),
      expect.anything(),
      { metric: "breached", sort: "longest_waiting", page: 2, limit: 10 }
    );
  });
});

describe("pickInterval", () => {
  it("buckets by day for short ranges, week for medium, month for up to ~2 years, year beyond that", () => {
    expect(pickInterval("2026-01-01", "2026-01-20")).toBe("day");
    expect(pickInterval("2026-01-01", "2026-05-01")).toBe("week");
    expect(pickInterval("2025-01-01", "2026-01-01")).toBe("month");
    expect(pickInterval("2020-01-01", "2026-01-01")).toBe("year");
    expect(pickInterval(undefined, undefined)).toBe("month");
  });
});

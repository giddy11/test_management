// modules/sla/tests/sla.repository.spec.ts
// The parts of SlaRepository that decide WHICH reports count as the same problem
// ("Most recurring issues"). The SQL itself needs a real database; what is checked
// here is what is built and asked for — above all, that an IT supporter is never
// given link-based groups, which could name an internal bug.
import { SlaRepository, occurrenceKeySql } from "../repositories/sla.repository";
import { DEFAULT_SLA_TARGETS } from "../services/sla.service";

const rules = {
  targets: DEFAULT_SLA_TARGETS,
  bugTargets: DEFAULT_SLA_TARGETS,
  featureRequestTarget: DEFAULT_SLA_TARGETS.default,
  pausedStatuses: [],
};

// A repository whose database is a spy, answering each query in turn.
function repoAnswering(...answers: unknown[][]) {
  const repo = new SlaRepository();
  const query = jest.fn();
  for (const rows of answers) query.mockResolvedValueOnce(rows);
  query.mockResolvedValue([]);
  (repo as any).ds = { query };
  return { repo, query };
}

const groupRow = (over: Record<string, unknown> = {}) => ({
  groupKey: "title:p-1:bug:sign up button not working",
  source: "bug",
  title: "Sign up button not working",
  firstId: "b-1",
  firstSource: "bug",
  firstNumber: 14,
  projectId: "p-1",
  projectName: "Apollo",
  count: 3,
  open: 1,
  resolved: 2,
  breached: 0,
  afterFix: 1,
  votes: null,
  avgResolutionMs: 3600000,
  firstSeenAt: new Date("2026-03-01T09:00:00Z"),
  lastSeenAt: new Date("2026-09-28T09:00:00Z"),
  ...over,
});

describe("occurrenceKeySql", () => {
  it("prefers the team's repeat links, then falls back to identical titles", () => {
    const sql = occurrenceKeySql("t", true);
    expect(sql).toContain("ticket_links");
    // Both directions: a repeat takes its original's key; an original keeps its own.
    expect(sql).toContain("l.source_id = t.id");
    expect(sql).toContain("l.target_id = t.id");
    expect(sql).toContain("'title:'");
    // Only "duplicate" links group anything — "related" ones are not repeats.
    expect(sql).toContain("l.link_type = 'duplicate'");
    // A customer ticket is stored as "feedback" in ticket_links.
    expect(sql).toContain("WHEN 'ticket' THEN 'feedback'");
  });

  it("uses titles alone when links are off, and never touches ticket_links", () => {
    const sql = occurrenceKeySql("t", false);
    expect(sql).not.toContain("ticket_links");
    expect(sql).toContain("'title:'");
  });
});

describe("SlaRepository.recurring", () => {
  it("names a linked group after its original, wherever the original was raised", async () => {
    const { repo, query } = repoAnswering(
      [
        groupRow({
          groupKey: "bug:orig-bug",
          firstId: "b-2",
          firstNumber: 89,
          // the earliest report IN RANGE is the repeat, not the original
          title: "Sign up button is broken",
        }),
      ],
      // …so the original is read from its own table, outside the date range.
      [
        {
          id: "orig-bug",
          title: "Sign up button not working",
          number: 14,
          createdAt: new Date("2026-03-01T09:00:00Z"),
          projectId: "p-1",
          projectName: "Apollo",
        },
      ]
    );

    const [row] = await repo.recurring({ organizationId: "org-1" }, {}, rules as any);

    expect(query).toHaveBeenCalledTimes(2);
    expect(row).toMatchObject({
      groupKey: "bug:orig-bug",
      title: "Sign up button not working",
      referenceCode: "BF-20260301-014",
      ticketId: "orig-bug",
      ticketSource: "bug",
      linked: true,
      count: 3,
      afterFix: 1,
    });
  });

  it("falls back to the earliest report when the original has since been deleted", async () => {
    const { repo } = repoAnswering(
      [groupRow({ groupKey: "bug:gone", firstId: "b-2", firstNumber: 89, firstSeenAt: new Date("2026-09-28T09:00:00Z") })],
      [] // the original no longer exists
    );

    const [row] = await repo.recurring({ organizationId: "org-1" }, {}, rules as any);

    expect(row).toMatchObject({
      title: "Sign up button not working",
      referenceCode: "BF-20260928-089",
      ticketId: "b-2",
      linked: true,
    });
  });

  it("groups identical titles without looking anything else up", async () => {
    const { repo, query } = repoAnswering([groupRow()]);

    const [row] = await repo.recurring({ organizationId: "org-1" }, {}, rules as any);

    expect(query).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ linked: false, referenceCode: "BF-20260301-014", ticketId: "b-1" });
  });

  it("gives an IT supporter identical-title groups only — no links, no lookups of internal tickets", async () => {
    const { repo, query } = repoAnswering([groupRow({ source: "ticket", firstSource: "ticket" })]);

    await repo.recurring({ clientCompanyId: "cc-1" }, {}, rules as any);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0];
    expect(sql).not.toContain("ticket_links");
  });

  it("ranks each kind on its own and takes the limit per kind", async () => {
    const { repo, query } = repoAnswering([]);

    await repo.recurring({ organizationId: "org-1" }, {}, rules as any, 7);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("PARTITION BY g.source");
    expect(sql).toContain("HAVING count(*) >= 2");
    expect(params[params.length - 1]).toBe(7);
  });
});

describe("SlaRepository.tickets — drilling into a group", () => {
  it("filters to the group's own key with a bound parameter", async () => {
    const { repo, query } = repoAnswering([{ n: 0 }], []);

    await repo.tickets({ organizationId: "org-1" }, { recurringKey: "bug:orig-bug" }, rules as any, {});

    const [countSql, countParams] = query.mock.calls[0];
    expect(countSql).toContain("ticket_links");
    expect(countParams).toContain("bug:orig-bug");
    // The key is a parameter, never spliced into the SQL.
    expect(countSql).not.toContain("bug:orig-bug");
  });

  it("gives an IT supporter the title rule only, so a link key matches nothing", async () => {
    const { repo, query } = repoAnswering([{ n: 0 }], []);

    await repo.tickets({ clientCompanyId: "cc-1" }, { recurringKey: "bug:orig-bug" }, rules as any, {});

    const [countSql] = query.mock.calls[0];
    expect(countSql).not.toContain("ticket_links");
  });

  it("adds no group condition when no key is given", async () => {
    const { repo, query } = repoAnswering([{ n: 0 }], []);

    await repo.tickets({ organizationId: "org-1" }, {}, rules as any, {});

    expect(query.mock.calls[0][0]).not.toContain("ticket_links");
  });
});

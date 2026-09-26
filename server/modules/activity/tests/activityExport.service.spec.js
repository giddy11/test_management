// modules/activity/tests/activityExport.service.spec.js
const { ActivityExportService, toCsv } = require("../services/activityExport.service");

const row = (overrides = {}) => ({
  createdAt: new Date("2026-09-20T08:30:00.000Z"),
  action: "role.assigned",
  summary: "Changed roles for a team member",
  severity: "critical",
  entityType: "user",
  entityId: "u-9",
  actorName: "Ada Lovelace",
  actorRole: "admin",
  actorId: "u-1",
  metadata: { before: [], after: [{ id: "r-1" }] },
  ...overrides,
});

describe("toCsv", () => {
  it("writes a header and one line per row", () => {
    const out = toCsv([row(), row({ action: "project.created" })]);
    const lines = out.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"Severity"');
    expect(lines[1]).toContain('"role.assigned"');
    expect(lines[1]).toContain('"2026-09-20T08:30:00.000Z"');
  });

  it("escapes embedded quotes rather than breaking the row", () => {
    const out = toCsv([row({ summary: 'Created project "Apollo"' })]);
    expect(out).toContain('"Created project ""Apollo"""');
    expect(out.replace(/^﻿/, "").trim().split("\r\n")).toHaveLength(2);
  });

  // The summary is built from user-supplied names, and a spreadsheet will
  // happily execute a cell that starts with `=`.
  it("neutralises text a spreadsheet would read as a formula", () => {
    const out = toCsv([row({ summary: '=HYPERLINK("http://evil","click")' })]);
    expect(out).toContain(`"'=HYPERLINK(`);
  });

  it("starts with a BOM so Excel reads it as UTF-8", () => {
    expect(toCsv([])[0]).toBe("﻿");
  });
});

describe("ActivityExportService", () => {
  it("exports exactly the rows the filtered view would show", async () => {
    const activity = { fetchForExport: jest.fn().mockResolvedValue([row()]) };
    const service = new ActivityExportService(activity);
    const actor = { id: "u-1" };

    const { csv, filename } = await service.exportCsv(actor, {
      severity: "critical",
      search: "ada",
    });

    expect(activity.fetchForExport).toHaveBeenCalledWith(actor, {
      severity: "critical",
      search: "ada",
    });
    expect(csv).toContain("Ada Lovelace");
    expect(filename).toMatch(/^activity-log-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("produces a header-only file when the actor may see nothing", async () => {
    const activity = { fetchForExport: jest.fn().mockResolvedValue([]) };
    const { csv } = await new ActivityExportService(activity).exportCsv({}, {});
    expect(csv.replace(/^﻿/, "").trim().split("\r\n")).toHaveLength(1);
  });
});

// modules/testCase/tests/testCaseExport.service.spec.js
// Builds a real workbook in memory and reads it back, so the assertions cover
// the actual .xlsx a user downloads — headers, ordering and cell values.
const ExcelJS = require("exceljs");
const { TestCaseExportService } = require("../services/testCaseExport.service");
const { permissionsFor } = require("../../../test/actors");

const SUITE = { id: "suite-1", name: "Authentication", projectId: "proj-1" };

const CASE_RUN = {
  id: "tc-1",
  title: "Valid login",
  description: "User signs in with correct credentials",
  steps: ["Open the login page", "Enter valid credentials"],
  expectedResult: "Dashboard is shown",
  priority: "High",
  status: "Active",
  tags: ["smoke"],
  assignees: [{ firstName: "Ada", lastName: "Admin", email: "ada@acme.test" }],
  deadline: null,
  latestResultStatus: "fail",
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
};

const CASE_NEVER_RUN = {
  id: "tc-2",
  title: "Invalid login shows error",
  description: null,
  steps: ["Enter a wrong password"],
  expectedResult: "An error toast appears",
  priority: "Medium",
  status: "Draft",
  tags: [],
  assignees: [],
  deadline: null,
  latestResultStatus: null,
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
};

const LATEST_RESULT = {
  test_case_id: "tc-1",
  status: "fail",
  actual_result: "Stuck on a spinner",
  notes: "Timed out at step 3",
  executed_at: new Date("2026-02-10T09:30:00.000Z"),
  run_name: "Release 1.4 run",
  executed_by: "Gideon Edoghotu",
};

function makeService({ cases = [CASE_RUN, CASE_NEVER_RUN], latest = [LATEST_RESULT] } = {}) {
  const tcRepo = {
    findAllForExport: jest.fn().mockResolvedValue(cases),
    latestResultDetailsForCases: jest
      .fn()
      .mockResolvedValue(new Map(latest.map((r) => [r.test_case_id, r]))),
  };
  const attachmentRepo = { findByTestCaseIds: jest.fn().mockResolvedValue([]) };
  const suiteRepo = { findAllByProject: jest.fn() };
  const suiteService = { getTestSuite: jest.fn().mockResolvedValue(SUITE) };
  const projectService = { getProject: jest.fn() };
  return {
    tcRepo,
    service: new TestCaseExportService(
      tcRepo,
      attachmentRepo,
      suiteRepo,
      suiteService,
      projectService
    ),
  };
}

// Reads the exported buffer back into a header->value map per data row.
async function readSheet(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const headers = ws.getRow(1).values.slice(1).map(String);
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const values = row.values.slice(1);
    rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));
  });
  return { headers, rows, sheetName: ws.name };
}

const actor = { id: "user-1", role: "admin", permissions: permissionsFor("admin"), organizationId: "org-1" };

describe("TestCaseExportService — run results in the export", () => {
  it("includes the latest run result's detail columns", async () => {
    const { service } = makeService();
    const { buffer } = await service.exportSuite(actor, "suite-1");
    const { headers, rows, sheetName } = await readSheet(buffer);

    expect(sheetName).toBe("Authentication");
    expect(headers).toEqual(
      expect.arrayContaining([
        "Latest Run Result",
        "Run",
        "Executed By",
        "Executed At",
        "Actual Result",
        "Result Notes",
      ])
    );

    const executed = rows.find((r) => r.Title === "Valid login");
    expect(executed["Latest Run Result"]).toBe("Fail");
    expect(executed.Run).toBe("Release 1.4 run");
    expect(executed["Executed By"]).toBe("Gideon Edoghotu");
    expect(executed["Executed At"]).toBe("2026-02-10T09:30:00.000Z");
    expect(executed["Actual Result"]).toBe("Stuck on a spinner");
    expect(executed["Result Notes"]).toBe("Timed out at step 3");
  });

  it("leaves the result columns blank for a case that has never been run", async () => {
    const { service } = makeService();
    const { buffer } = await service.exportSuite(actor, "suite-1");
    const { rows } = await readSheet(buffer);

    const neverRun = rows.find((r) => r.Title === "Invalid login shows error");
    expect(neverRun["Latest Run Result"]).toBe("Not run");
    expect(neverRun.Run).toBe("");
    expect(neverRun["Executed By"]).toBe("");
    expect(neverRun["Executed At"]).toBe("");
    expect(neverRun["Actual Result"]).toBe("");
    expect(neverRun["Result Notes"]).toBe("");
  });

  it("looks up result detail for exactly the exported cases", async () => {
    const { service, tcRepo } = makeService();
    await service.exportSuite(actor, "suite-1");
    expect(tcRepo.latestResultDetailsForCases).toHaveBeenCalledWith(["tc-1", "tc-2"]);
  });

  it("still exports when no case has ever been run", async () => {
    const { service } = makeService({ cases: [CASE_NEVER_RUN], latest: [] });
    const { buffer } = await service.exportSuite(actor, "suite-1");
    const { rows } = await readSheet(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]["Latest Run Result"]).toBe("Not run");
  });
});

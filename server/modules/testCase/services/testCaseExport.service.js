// modules/testCase/services/testCaseExport.service.js
// Builds the .xlsx workbooks streamed by the suite/project "Export" buttons.
const ExcelJS = require("exceljs");
const { TestCaseRepository } = require("../repositories/testCase.repository");
const {
  TestCaseAttachmentRepository,
} = require("../repositories/testCaseAttachment.repository");
const { TestSuiteRepository } = require("../../testSuite/repositories/testSuite.repository");
const { TestSuiteService } = require("../../testSuite/services/testSuite.service");
const { ProjectService } = require("../../project/services/project.service");
const { AppError } = require("../../../shared/errors/AppError");
const {
  restrictToOwnWorkOrNull,
} = require("../../../shared/access/scope");

// Guards ExcelJS's in-memory workbook build against runaway project exports.
const MAX_EXPORT_ROWS = 20000;

const EXPORT_COLUMNS = [
  { header: "External ID", key: "externalId", width: 24 },
  { header: "Title", key: "title", width: 28 },
  { header: "Description", key: "description", width: 34 },
  { header: "Steps", key: "steps", width: 42 },
  { header: "Expected Result", key: "expectedResult", width: 38 },
  { header: "Priority", key: "priority", width: 14 },
  { header: "Status", key: "status", width: 14 },
  { header: "Tags", key: "tags", width: 22 },
  { header: "Assigned To", key: "assignees", width: 28 },
  { header: "Deadline", key: "deadline", width: 16 },
  { header: "Latest Run Result", key: "latestResultStatus", width: 18 },
  { header: "Run", key: "runName", width: 26 },
  { header: "Executed By", key: "executedBy", width: 24 },
  { header: "Executed At", key: "executedAt", width: 20 },
  { header: "Actual Result", key: "actualResult", width: 38 },
  { header: "Result Notes", key: "resultNotes", width: 38 },
  { header: "Attachment URLs", key: "attachments", width: 40 },
  { header: "Created At", key: "createdAt", width: 20 },
];

const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// `latest` is the row from TestCaseRepository.latestResultDetailsForCases, or
// undefined when the case has never been part of a run.
function formatRow(tc, attachments, latest) {
  return {
    externalId: tc.externalId ?? "",
    title: tc.title,
    description: tc.description ?? "",
    steps: (tc.steps ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n"),
    expectedResult: tc.expectedResult ?? "",
    priority: tc.priority,
    status: tc.status,
    tags: (tc.tags ?? []).join(", "),
    assignees: (tc.assignees ?? [])
      .map((a) => `${[a.firstName, a.lastName].filter(Boolean).join(" ")} <${a.email}>`)
      .join(", "),
    deadline: tc.deadline ? new Date(tc.deadline).toISOString().slice(0, 10) : "",
    latestResultStatus:
      tc.latestResultStatus == null
        ? "Not run"
        : tc.latestResultStatus === "pending"
        ? "Pending"
        : titleCase(tc.latestResultStatus),
    runName: latest?.run_name ?? "",
    executedBy: latest?.executed_by || "",
    executedAt: latest?.executed_at ? new Date(latest.executed_at).toISOString() : "",
    actualResult: latest?.actual_result ?? "",
    resultNotes: latest?.notes ?? "",
    attachments: attachments.map((a) => a.fileUrl).join("\n"),
    createdAt: tc.createdAt ? new Date(tc.createdAt).toISOString() : "",
  };
}

// Excel sheet names: max 31 chars, and can't contain * ? : \ / [ ]
function sanitizeSheetName(name, usedNames) {
  let base = (name || "Suite").replace(/[*?:\\/[\]]/g, "").trim() || "Suite";
  base = base.slice(0, 31);

  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function sanitizeFilenamePart(name) {
  return (name || "export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "export";
}

class TestCaseExportService {
  static Instance = new TestCaseExportService();

  constructor(
    tcRepo = TestCaseRepository.Instance,
    attachmentRepo = TestCaseAttachmentRepository.Instance,
    suiteRepo = TestSuiteRepository.Instance,
    suiteService = TestSuiteService.Instance,
    projectService = ProjectService.Instance
  ) {
    this.tcRepo = tcRepo;
    this.attachmentRepo = attachmentRepo;
    this.suiteRepo = suiteRepo;
    this.suiteService = suiteService;
    this.projectService = projectService;
  }

  // Adds one formatted worksheet for `suite` to `workbook`.
  addSuiteSheet(workbook, suite, cases, attachmentsByCase, usedNames, latestResults = new Map()) {
    const ws = workbook.addWorksheet(sanitizeSheetName(suite.name, usedNames));
    ws.columns = EXPORT_COLUMNS;

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    header.alignment = { vertical: "middle" };
    header.height = 22;

    for (const tc of cases) {
      const attachments = attachmentsByCase.get(tc.id) ?? [];
      ws.addRow(formatRow(tc, attachments, latestResults.get(tc.id)));
    }

    ["description", "steps", "expectedResult", "attachments", "assignees", "actualResult", "resultNotes"].forEach((key) => {
      ws.getColumn(key).alignment = { wrapText: true, vertical: "top" };
    });

    return ws;
  }

  async attachmentsForCases(cases) {
    const rows = await this.attachmentRepo.findByTestCaseIds(cases.map((c) => c.id));
    const byCase = new Map();
    for (const row of rows) {
      const list = byCase.get(row.testCaseId) ?? [];
      list.push(row);
      byCase.set(row.testCaseId, list);
    }
    return byCase;
  }

  async exportSuite(actor, suiteId) {
    const suite = await this.suiteService.getTestSuite(actor, suiteId);
    const assigneeId = restrictToOwnWorkOrNull(actor);
    const cases = await this.tcRepo.findAllForExport(suiteId, assigneeId);
    const [attachmentsByCase, latestResults] = await Promise.all([
      this.attachmentsForCases(cases),
      this.tcRepo.latestResultDetailsForCases(cases.map((c) => c.id)),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "TestMate";
    this.addSuiteSheet(wb, suite, cases, attachmentsByCase, new Set(), latestResults);

    return {
      buffer: await wb.xlsx.writeBuffer(),
      filename: `${sanitizeFilenamePart(suite.name)}-test-cases.xlsx`,
    };
  }

  async exportProject(actor, projectId) {
    const project = await this.projectService.getProject(actor, projectId);
    const allSuites = await this.suiteRepo.findAllByProject(projectId);

    if (allSuites.length === 0) {
      throw new AppError("This project has no test suites to export", 422);
    }

    const assigneeId = restrictToOwnWorkOrNull(actor);

    // For restricted users, only include suites they have at least one assignment in.
    const suites = assigneeId
      ? (
          await Promise.all(
            allSuites.map(async (s) => ({
              suite: s,
              hasAssignment: await this.tcRepo.hasAssignmentInSuite(s.id, assigneeId),
            }))
          )
        )
          .filter((r) => r.hasAssignment)
          .map((r) => r.suite)
      : allSuites;

    if (suites.length === 0) {
      throw new AppError("You have no assigned test cases in this project to export", 422);
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "TestMate";
    const usedNames = new Set();
    let totalRows = 0;

    for (const suite of suites) {
      const cases = await this.tcRepo.findAllForExport(suite.id, assigneeId);
      totalRows += cases.length;
      if (totalRows > MAX_EXPORT_ROWS) {
        throw new AppError(
          `This project has too many test cases to export at once (limit ${MAX_EXPORT_ROWS}). Export suites individually instead.`,
          422
        );
      }
      const [attachmentsByCase, latestResults] = await Promise.all([
        this.attachmentsForCases(cases),
        this.tcRepo.latestResultDetailsForCases(cases.map((c) => c.id)),
      ]);
      this.addSuiteSheet(wb, suite, cases, attachmentsByCase, usedNames, latestResults);
    }

    return {
      buffer: await wb.xlsx.writeBuffer(),
      filename: `${sanitizeFilenamePart(project.name)}-test-suites.xlsx`,
    };
  }
}

module.exports = { TestCaseExportService };

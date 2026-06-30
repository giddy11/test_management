// modules/testCase/services/testCaseImport.service.js
const ExcelJS = require("exceljs");
const { TestCaseRepository } = require("../repositories/testCase.repository");
const { TestSuiteService } = require("../../testSuite/services/testSuite.service");
const { importStore } = require("../../../shared/utils/importStore");
const { AppError } = require("../../../shared/errors/AppError");
const { importRowSchema } = require("../validators/testCaseImport.schema");
const {
  TestCaseStatus,
  TestCasePriority,
  enums,
} = require("../../../config/constants");

// ── Cell helpers ─────────────────────────────────────────────────────────────
function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join("");
    if (value.text) return value.text;
    if (value.result !== undefined) return String(value.result);
    if (value.hyperlink) return value.text || value.hyperlink;
    return "";
  }
  return String(value);
}

const stripMarker = (s) => s.replace(/^\s*\d+[.)]\s*/, "").trim();

// Splits steps whether they are one-per-line OR a single "1. … 2. … 3. …" cell.
function parseSteps(raw) {
  const text = cellText(raw).trim();
  if (!text) return [];
  const byLine = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine.map(stripMarker).filter(Boolean);
  // Single block: pull out "N. content" segments. The lookahead requires whitespace
  // before the next marker so decimals/times (e.g. "10:00") aren't treated as steps.
  const matches = [...text.matchAll(/(\d+)[.)]\s+(.+?)(?=\s+\d+[.)]\s+|$)/gs)];
  if (matches.length > 1) return matches.map((m) => m[2].trim()).filter(Boolean);
  return [stripMarker(text)].filter(Boolean);
}

const splitCsv = (v) =>
  cellText(v).split(/[,;]/).map((s) => s.trim()).filter(Boolean);

function titleCase(s) {
  const t = s.trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function normalizePriority(raw) {
  const v = titleCase(cellText(raw));
  return enums.testCasePriority.includes(v) ? v : TestCasePriority.MEDIUM;
}

// The source "Status" column is usually a result (Pass/Fail/…), not a case status,
// so only accept Draft/Active/Deprecated — otherwise default imported cases to Active.
function normalizeStatus(raw) {
  const v = titleCase(cellText(raw));
  return enums.testCaseStatus.includes(v) ? v : TestCaseStatus.ACTIVE;
}

// ── Header mapping — strictly the columns from the downloaded template ───────────
const normHeader = (h) =>
  cellText(h).replace(/\(.*?\)/g, "").replace(/\*/g, "").trim().toLowerCase();

const FIELD_SYNONYMS = {
  title: ["feature"],
  description: ["test scenario"],
  steps: ["steps to execute"],
  expectedResult: ["expected result"],
  priority: ["severity"],
  tags: ["tags"],
};
const TEMPLATE_HEADERS = [
  "feature",
  "test scenario",
  "steps to execute",
  "expected result",
  "severity",
  "tags",
];
const REQUIRED_HEADERS = ["feature", "steps to execute", "expected result", "severity"];

function readHeaders(ws) {
  const headers = [];
  for (let c = 1; c <= ws.columnCount; c++) {
    const norm = normHeader(ws.getRow(1).getCell(c).value);
    if (norm) headers.push(norm);
  }
  return headers;
}

// Rejects any sheet whose columns aren't exactly the template's columns.
function assertTemplateColumns(headers) {
  const unexpected = [...new Set(headers.filter((h) => !TEMPLATE_HEADERS.includes(h)))];
  if (unexpected.length) {
    throw new AppError(
      `These columns aren't part of the TestMate template: ${unexpected.join(", ")}. Please download the template and import that.`,
      422
    );
  }
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new AppError(
      `Your file is missing required columns: ${missing.join(", ")}. Please download the template and import that.`,
      422
    );
  }
}

function buildColumnMap(ws) {
  const headerRow = ws.getRow(1);
  const map = {};
  for (let c = 1; c <= ws.columnCount; c++) {
    const norm = normHeader(headerRow.getCell(c).value);
    if (!norm) continue;
    for (const [field, syns] of Object.entries(FIELD_SYNONYMS)) {
      if (map[field] === undefined && syns.includes(norm)) {
        map[field] = c;
        break;
      }
    }
  }
  return map;
}

class TestCaseImportService {
  static Instance = new TestCaseImportService();

  constructor(
    tcRepo = TestCaseRepository.Instance,
    suiteService = TestSuiteService.Instance
  ) {
    this.tcRepo = tcRepo;
    this.suiteService = suiteService;
  }

  async parseBuffer(buffer) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      throw new AppError("Could not read the spreadsheet — is it a valid .xlsx file?", 422);
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new AppError("The spreadsheet has no sheets", 422);

    // Protection: only accept files that use the downloaded template's columns.
    assertTemplateColumns(readHeaders(ws));
    const col = buildColumnMap(ws);

    const rows = [];
    const skipped = []; // invalid rows are skipped (not fatal) and reported back
    let lastTitle = ""; // carry forward for merged 'Feature' cells

    const get = (row, field) =>
      col[field] !== undefined ? row.getCell(col[field]).value : undefined;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header

      const titleRaw = cellText(get(row, "title")).trim();
      const steps = parseSteps(get(row, "steps"));
      const expectedResult = cellText(get(row, "expectedResult")).trim();
      if (titleRaw) lastTitle = titleRaw;

      // Skip rows that carry no real content (blank spacer rows).
      if (!titleRaw && steps.length === 0 && !expectedResult) return;

      const parsed = {
        title: (titleRaw || lastTitle).slice(0, 200),
        description: cellText(get(row, "description")).trim() || undefined,
        steps,
        expectedResult,
        priority: normalizePriority(get(row, "priority")),
        status: normalizeStatus(get(row, "status")),
        tags: col.tags !== undefined ? splitCsv(get(row, "tags")) : [],
      };

      const result = importRowSchema.safeParse(parsed);
      if (!result.success) {
        skipped.push({
          row: rowNumber,
          title: parsed.title || "(untitled)",
          issues: result.error.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
        });
      } else {
        rows.push(result.data);
      }
    });

    if (rows.length === 0) {
      throw new AppError(
        skipped.length
          ? "No valid test case rows found — check the required columns and try again"
          : "The spreadsheet has no test case rows",
        422,
        skipped
      );
    }
    return { rows, skipped };
  }

  async upload(actor, suiteId, buffer) {
    await this.suiteService.getTestSuite(actor, suiteId);
    const { rows, skipped } = await this.parseBuffer(buffer);
    const importId = importStore.create({ ownerId: actor.id, suiteId, rows, skipped });
    return { importId, totalRows: rows.length, skippedCount: skipped.length, rows, skipped };
  }

  getPreview(actor, importId) {
    const session = importStore.get(importId);
    if (!session || session.ownerId !== actor.id) {
      throw new AppError("Import session not found or expired", 404);
    }
    return {
      importId,
      suiteId: session.suiteId,
      totalRows: session.rows.length,
      skippedCount: session.skipped?.length ?? 0,
      rows: session.rows,
      skipped: session.skipped ?? [],
    };
  }

  async confirm(actor, importId) {
    const session = importStore.get(importId);
    if (!session || session.ownerId !== actor.id) {
      throw new AppError("Import session not found or expired", 404);
    }
    await this.suiteService.getTestSuite(actor, session.suiteId);

    const created = await this.tcRepo.createMany(
      session.rows.map((r) => ({
        title: r.title,
        description: r.description ?? null,
        steps: r.steps,
        expectedResult: r.expectedResult,
        priority: r.priority,
        status: r.status ?? TestCaseStatus.ACTIVE,
        suiteId: session.suiteId,
        tags: r.tags ?? null,
        createdById: actor.id,
      }))
    );

    importStore.delete(importId);
    return { created: created.length };
  }
}

module.exports = { TestCaseImportService };

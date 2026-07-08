// modules/testCase/services/testCaseImport.service.js
const ExcelJS = require("exceljs");
const { TestCaseRepository } = require("../repositories/testCase.repository");
const { TestSuiteService } = require("../../testSuite/services/testSuite.service");
const { importStore } = require("../../../shared/utils/importStore");
const { ActivityService } = require("../../activity/services/activity.service");
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
  id: ["id"],
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
  "id",
];
const REQUIRED_HEADERS = ["id", "feature", "steps to execute", "expected result", "severity"];

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
    const hasNoId = missing.includes("id");
    throw new AppError(
      hasNoId
        ? "Your file is missing the required ID column. Please download the latest template — the ID column must be present and every row must have an ID value."
        : `Your file is missing required columns: ${missing.join(", ")}. Please download the template and import that.`,
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

      // Extract ID — any non-empty string is valid (numbers, slugs, UUIDs all accepted).
      const idRaw = col.id !== undefined ? cellText(get(row, "id")).trim() : "";
      const rowId = idRaw || undefined;

      const parsed = {
        id: rowId,
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
      const idSkipped = skipped.some((s) => s.issues.some((i) => i.field === "id"));
      throw new AppError(
        idSkipped
          ? "No rows could be imported — every row must have a value in the ID column. Fill in the ID column and try again."
          : skipped.length
          ? "No valid test case rows found — check the required columns and try again"
          : "The spreadsheet has no test case rows",
        422,
        skipped
      );
    }
    return { rows, skipped };
  }

  async upload(actor, suiteId, buffer) {
    const suite = await this.suiteService.getTestSuite(actor, suiteId);
    await this.suiteService.projectService.assertCanManageProject(actor, suite.projectId);
    const { rows, skipped } = await this.parseBuffer(buffer);

    // 1. Deduplicate within the file by ID.
    const seenIds = new Set();
    const inFileDuplicates = [];
    const uniqueRows = [];
    for (const row of rows) {
      if (seenIds.has(row.id)) {
        inFileDuplicates.push({ title: row.title, id: row.id, reason: "duplicate in file" });
        continue;
      }
      seenIds.add(row.id);
      uniqueRows.push(row);
    }

    // 2. Deduplicate against cases already in the suite by external_id.
    const existingIdSet = await this.tcRepo.findExistingExternalIdSet(
      suiteId,
      uniqueRows.map((r) => r.id)
    );

    const toCreate = [];
    const existingDuplicates = [];
    for (const row of uniqueRows) {
      if (existingIdSet.has(row.id)) {
        existingDuplicates.push({ title: row.title, id: row.id, reason: "already exists in suite" });
      } else {
        toCreate.push(row);
      }
    }

    const duplicates = [...inFileDuplicates, ...existingDuplicates];

    const importId = importStore.create({
      ownerId: actor.id,
      suiteId,
      rows: toCreate,
      skipped,
      duplicates,
    });

    return {
      importId,
      totalRows: toCreate.length,
      skippedCount: skipped.length,
      duplicatesCount: duplicates.length,
      rows: toCreate,
      skipped,
      duplicates,
    };
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
      duplicatesCount: session.duplicates?.length ?? 0,
      rows: session.rows,
      skipped: session.skipped ?? [],
      duplicates: session.duplicates ?? [],
    };
  }

  async confirm(actor, importId) {
    const session = importStore.get(importId);
    if (!session || session.ownerId !== actor.id) {
      throw new AppError("Import session not found or expired", 404);
    }
    const suite = await this.suiteService.getTestSuite(actor, session.suiteId);
    await this.suiteService.projectService.assertCanManageProject(actor, suite.projectId);

    // Re-check at write time in case cases were added between upload and confirm.
    const existingIdSet = await this.tcRepo.findExistingExternalIdSet(
      session.suiteId,
      session.rows.map((r) => r.id)
    );
    const toCreate = session.rows.filter((r) => !existingIdSet.has(r.id));
    const duplicatesSkipped = session.rows.length - toCreate.length;

    if (toCreate.length === 0) {
      importStore.delete(importId);
      return { created: 0, duplicatesSkipped };
    }

    const created = await this.tcRepo.createMany(
      toCreate.map((r) => ({
        title: r.title,
        description: r.description ?? null,
        steps: r.steps,
        expectedResult: r.expectedResult,
        priority: r.priority,
        status: r.status ?? TestCaseStatus.ACTIVE,
        suiteId: session.suiteId,
        tags: r.tags ?? null,
        externalId: r.id ?? null,
        createdById: actor.id,
      }))
    );

    importStore.delete(importId);

    const suiteLabel = ` into suite "${suite.name}"`;
    const summary = duplicatesSkipped > 0
      ? `Imported ${created.length} test case${created.length === 1 ? "" : "s"}${suiteLabel}, skipped ${duplicatesSkipped} duplicate${duplicatesSkipped === 1 ? "" : "s"}`
      : `Imported ${created.length} test case${created.length === 1 ? "" : "s"}${suiteLabel}`;

    ActivityService.Instance.log(actor, {
      action: "test_case.imported",
      summary,
      entityType: "suite",
      entityId: session.suiteId,
      metadata: { suiteId: session.suiteId, projectId: suite.projectId },
    });
    return { created: created.length, duplicatesSkipped };
  }
}

module.exports = { TestCaseImportService };

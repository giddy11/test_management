// modules/activity/services/activityExport.service.js
// Builds the CSV behind the activity log's "Export" button.
//
// CSV rather than the .xlsx the test-case exports produce: an audit extract is
// read by grep, a SIEM or a spreadsheet in roughly equal measure, and the
// metadata column is raw JSON that a workbook cell would only mangle.
const { ActivityService } = require("./activity.service");

const COLUMNS = [
  ["When", (a) => (a.createdAt ? new Date(a.createdAt).toISOString() : "")],
  ["Action", (a) => a.action ?? ""],
  ["Summary", (a) => a.summary ?? ""],
  ["Severity", (a) => a.severity ?? "info"],
  ["Record type", (a) => a.entityType ?? ""],
  ["Record ID", (a) => a.entityId ?? ""],
  ["Actor", (a) => a.actorName ?? ""],
  ["Actor role", (a) => a.actorRole ?? ""],
  ["Actor ID", (a) => a.actorId ?? ""],
  ["Metadata", (a) => (a.metadata ? JSON.stringify(a.metadata) : "")],
];

// RFC 4180. A leading `'` on anything a spreadsheet would read as a formula:
// the summary is user-supplied text, and `=cmd|...` in a cell is a real attack
// on whoever opens the export.
function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  const lines = [COLUMNS.map(([header]) => csvCell(header)).join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map(([, read]) => csvCell(read(row))).join(","));
  }
  // The BOM is what makes Excel open a UTF-8 CSV as UTF-8 rather than as the
  // system codepage, which otherwise mojibakes every non-ASCII name in the log.
  return `﻿${lines.join("\r\n")}\r\n`;
}

class ActivityExportService {
  static Instance = new ActivityExportService();

  constructor(activity = ActivityService.Instance) {
    this.activity = activity;
  }

  // Same scope and same filters as the on-screen view, so the file can never
  // contain a row the page would have hidden.
  async exportCsv(actor, params) {
    const rows = await this.activity.fetchForExport(actor, params);
    const stamp = new Date().toISOString().slice(0, 10);
    return { csv: toCsv(rows), filename: `activity-log-${stamp}.csv` };
  }
}

module.exports = { ActivityExportService, toCsv };

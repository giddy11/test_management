// modules/testCase/services/testCaseTemplate.service.js
// Generates the pre-formatted XLSX template testers fill in for bulk import.
const ExcelJS = require("exceljs");
const { enums } = require("../../../config/constants");

const COLUMNS = [
  { header: "ID", key: "id", width: 38 },
  { header: "Feature *", key: "title", width: 28 },
  { header: "Test Scenario", key: "description", width: 34 },
  { header: "Steps to Execute *", key: "steps", width: 42 },
  { header: "Expected Result *", key: "expectedResult", width: 38 },
  { header: "Severity *", key: "priority", width: 16 },
  { header: "Tags", key: "tags", width: 22 },
];

class TestCaseTemplateService {
  static Instance = new TestCaseTemplateService();

  async buildTemplate() {
    const wb = new ExcelJS.Workbook();
    wb.creator = "TestMate";
    const ws = wb.addWorksheet("Test Cases");
    ws.columns = COLUMNS;

    // Header styling — all columns get the dark header.
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    header.alignment = { vertical: "middle" };
    header.height = 22;

    // Override the ID header cell to look muted — it's system-managed, not user-entered.
    const idLetter = ws.getColumn("id").letter;
    ws.getCell(`${idLetter}1`).font = { bold: true, color: { argb: "FF888888" } };
    ws.getCell(`${idLetter}1`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };

    // One example row to guide the tester.
    ws.addRow({
      id: "",
      title: "Create Event Form",
      description: "Title field shows error when fewer than 3 characters",
      steps: "1. Navigate to Create Event page\n2. Enter a 2-character title\n3. Submit the form",
      expectedResult: "Validation error is shown on the Title field",
      priority: "High",
      tags: "smoke, validation",
    });

    // Wrap text on the long columns.
    ["steps", "expectedResult", "description"].forEach((key) => {
      ws.getColumn(key).alignment = { wrapText: true, vertical: "top" };
    });

    // Dropdown validation for Severity — derive the column letter dynamically.
    const priorityLetter = ws.getColumn("priority").letter;
    const priorityList = `"${enums.testCasePriority.join(",")}"`;
    for (let r = 2; r <= 500; r++) {
      ws.getCell(`${priorityLetter}${r}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [priorityList],
      };
    }

    return wb.xlsx.writeBuffer();
  }
}

module.exports = { TestCaseTemplateService };

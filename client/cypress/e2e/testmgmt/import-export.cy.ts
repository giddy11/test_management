import { listMeta, ok } from "../../support/api"
import type { ApiEnvelope } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"
const SUITE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

// A tiny stand-in for the .xlsx upload — the parse response is stubbed, so
// the file's actual content never matters.
const XLSX_FILE = {
  contents: Cypress.Buffer.from("e2e xlsx placeholder"),
  fileName: "cases.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

const PREVIEW = {
  importId: "e2e-import-1",
  suiteId: SUITE_ID,
  totalRows: 2,
  skippedCount: 1,
  duplicatesCount: 1,
  rows: [
    {
      title: "Reset password via email",
      steps: ["Request code", "Enter code", "Set password"],
      expectedResult: "Password updated",
      priority: "High",
      status: "Draft",
    },
    {
      title: "Session expires after logout",
      steps: ["Log in", "Log out", "Press back"],
      expectedResult: "Redirected to login",
      priority: "Medium",
      status: "Draft",
    },
  ],
  skipped: [{ row: 4, title: "Broken row", issues: [{ field: "expectedResult", message: "Expected result is required" }] }],
  duplicates: [{ title: "Valid login", id: "3f2504e0-4f89-41d3-9a0c-0305e82c3399", reason: "already exists in suite" }],
}

describe("Import / export test cases (XLSX)", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.fixture("testmgmt/suites").then((suites) => {
      cy.interceptApi("GET", `/test-suites/${SUITE_ID}`, { body: ok(suites[0]) }, "suite")
    })
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi("GET", "/test-cases", { body: ok(cases, listMeta(cases.length)) }, "cases")
    })
    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.wait("@cases")
  })

  it("uploads a sheet, previews rows, and confirms the import", () => {
    cy.interceptApi("POST", "/test-cases/import", { body: ok(PREVIEW) }, "uploadImport")
    cy.interceptApi(
      "POST",
      `/test-cases/import/${PREVIEW.importId}/confirm`,
      { body: ok({ created: 2, duplicatesSkipped: 1 }) },
      "confirmImport"
    )

    cy.dataCy("import-cases").click()
    cy.contains("Import test cases").should("be.visible")
    cy.dataCy("import-file").selectFile(XLSX_FILE, { force: true })

    cy.wait("@uploadImport")
    cy.contains("2").should("exist")
    cy.contains("test cases ready to import").should("be.visible")
    cy.contains("1 row skipped — incomplete data").should("be.visible")
    cy.contains("1 duplicate skipped").should("be.visible")
    cy.contains("Reset password via email").should("be.visible")
    cy.contains("Session expires after logout").should("be.visible")

    cy.dataCy("import-confirm").should("contain", "Import 2 test cases").click()
    cy.wait("@confirmImport")
    cy.contains("Imported 2 test cases · 1 duplicate skipped").should("be.visible")
  })

  it("lists row errors when the sheet fails validation", () => {
    const errorBody: ApiEnvelope = {
      success: false,
      message: "The sheet has invalid rows",
      statusCode: 422,
      data: null,
      errors: [
        { row: 2, issues: [{ field: "title", message: "Title is required" }] },
        { row: 3, issues: [{ field: "steps", message: "Add at least one step" }] },
      ] as unknown as ApiEnvelope["errors"],
    }
    cy.intercept("POST", /\/api\/v1\/test-cases\/import$/, { statusCode: 422, body: errorBody }).as("uploadImport")

    cy.dataCy("import-cases").click()
    cy.dataCy("import-file").selectFile(XLSX_FILE, { force: true })

    cy.wait("@uploadImport")
    cy.contains("Fix these rows in your sheet and re-upload:").should("be.visible")
    cy.contains("Row 2:").should("be.visible")
    cy.contains("title — Title is required").should("be.visible")
    cy.contains("Row 3:").should("be.visible")
  })

  it("downloads the template", () => {
    cy.intercept("GET", /\/api\/v1\/test-cases\/template$/, {
      statusCode: 200,
      body: "template-bytes",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    }).as("template")

    cy.dataCy("import-cases").click()
    cy.dataCy("import-template").click()
    cy.wait("@template")
  })

  it("exports the suite as XLSX", () => {
    cy.intercept("GET", /\/api\/v1\/test-suites\/[^/]+\/export$/, {
      statusCode: 200,
      body: "export-bytes",
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    }).as("exportSuite")

    cy.dataCy("export-suite").click()
    cy.wait("@exportSuite")
    cy.contains("Export downloaded").should("be.visible")
  })
})

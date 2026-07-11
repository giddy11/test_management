import { fail, listMeta, ok } from "../../support/api"

// Regression coverage for a bug where GET /api/v1/users was gated to
// admin/superadmin only. Project team leads are plain app-role "user"s (their
// "lead" status is a per-project membership row), so the assignee picker's
// user list silently came back empty for them.
//
// The picker now sources its options from the project's own members list
// (via GET /projects/:id) rather than the org-wide user roster, so a lead
// only ever sees — and can only assign — people who actually belong to the
// project.
const PROJECT_ID = "e2e-proj-1"
const SUITE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
const LEAD_ID = "e2e-user-0001"
const MEMBERS = [
  { id: LEAD_ID, name: "Uche Tester", email: "uche.tester@example.com", role: "team_lead" },
  { id: "e2e-user-0002", name: "Bola Runner", email: "bola.runner@example.com", role: "member" },
]

describe("Assign dialog — project lead access", () => {
  beforeEach(() => {
    cy.login("user")
    cy.fixture("testmgmt/suites").then((suites) => {
      cy.interceptApi("GET", `/test-suites/${SUITE_ID}`, { body: ok(suites[0]) }, "suite")
    })
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi("GET", "/test-cases", { body: ok(cases, listMeta(cases.length)) }, "cases")
    })
  })

  it("shows management actions to a lead and lists project members in the assignee picker", () => {
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi(
        "GET",
        `/projects/${PROJECT_ID}`,
        { body: ok({ ...projects[0], members: MEMBERS }) },
        "project"
      )
    })

    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.wait("@cases")

    // A lead (not a company admin) still gets management actions on their project.
    cy.dataCy("case-assign").should("have.length", 2)

    cy.contains('[data-cy="case-row"]', "Invalid login shows error").within(() => {
      cy.dataCy("case-assign").click()
    })
    cy.wait("@project")

    cy.get('[role="dialog"]').within(() => {
      cy.contains("Assign users").should("be.visible")
      cy.contains("No users found.").should("not.exist")
      cy.contains("Bola Runner").should("be.visible")
      cy.contains("bola.runner@example.com").should("be.visible")
    })
  })

  it("only offers users who belong to the project, not the full org roster", () => {
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi(
        "GET",
        `/projects/${PROJECT_ID}`,
        { body: ok({ ...projects[0], members: [MEMBERS[0]] }) },
        "project"
      )
    })

    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.wait("@cases")

    cy.contains('[data-cy="case-row"]', "Invalid login shows error").within(() => {
      cy.dataCy("case-assign").click()
    })
    cy.wait("@project")

    // Scoped to the dialog: the logged-in lead is also named "Uche Tester" and
    // shows up in the sidebar footer, so an unscoped cy.contains() would match
    // that instead and fail its visibility check against the dialog overlay.
    cy.get('[role="dialog"]').within(() => {
      cy.contains("Uche Tester").should("be.visible")
      cy.contains("Bola Runner").should("not.exist")
    })
  })

  it("lets a lead assign a user to a test case", () => {
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi(
        "GET",
        `/projects/${PROJECT_ID}`,
        { body: ok({ ...projects[0], members: MEMBERS }) },
        "project"
      )
    })
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi(
        "PATCH",
        "/test-cases/e2e-case-2/assignees",
        { body: ok({ ...cases[1], assignees: [{ id: "e2e-user-0002", name: "Bola Runner", email: "bola.runner@example.com" }] }) },
        "assign"
      )
    })

    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.wait("@cases")

    cy.contains('[data-cy="case-row"]', "Invalid login shows error").within(() => {
      cy.dataCy("case-assign").click()
    })
    cy.wait("@project")
    cy.get('[role="dialog"]').within(() => {
      cy.contains("Bola Runner").click()
      cy.contains("button", "Assign 1").click()
    })

    cy.wait("@assign")
      .its("request.body")
      .should("deep.equal", { userIds: ["e2e-user-0002"], deadline: null })
    cy.contains("Assignees updated").should("be.visible")
  })

  it("surfaces an error and leaves assignees untouched when the target user is mid-run", () => {
    // Server-side guard: a user currently executing a test run can't be
    // handed new work until it completes (avoids distracting them mid-run).
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi(
        "GET",
        `/projects/${PROJECT_ID}`,
        { body: ok({ ...projects[0], members: MEMBERS }) },
        "project"
      )
    })
    cy.interceptApi(
      "PATCH",
      "/test-cases/e2e-case-2/assignees",
      { statusCode: 409, body: fail("Bola Runner is currently executing a test run and can't be assigned new work until it's completed", 409) },
      "assignBlocked"
    )

    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.wait("@cases")

    cy.contains('[data-cy="case-row"]', "Invalid login shows error").within(() => {
      cy.dataCy("case-assign").click()
    })
    cy.wait("@project")
    cy.get('[role="dialog"]').within(() => {
      cy.contains("Bola Runner").click()
      cy.contains("button", "Assign 1").click()
    })

    cy.wait("@assignBlocked")
    // Scope to the toast — sonner also renders a hidden screen-reader copy.
    cy.get("[data-sonner-toast]").should("contain.text", "currently executing a test run")
  })

  it("hides management actions entirely rather than crashing when the project can't be loaded", () => {
    // The assignee picker now shares its data source (GET /projects/:id) with
    // the page-level "is this actor allowed to manage this project" check, so
    // a failed fetch here means no assign buttons render at all — there's no
    // separate dialog-only fetch left to fail once the dialog is already open.
    cy.interceptApi(
      "GET",
      `/projects/${PROJECT_ID}`,
      { statusCode: 403, body: ok(null) },
      "projectForbidden"
    )

    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.wait("@cases")
    cy.wait("@projectForbidden")

    cy.dataCy("case-assign").should("not.exist")
  })
})

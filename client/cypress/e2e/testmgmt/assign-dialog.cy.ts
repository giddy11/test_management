import { fail, listMeta, ok } from "../../support/api"

// Regression coverage for a bug where GET /api/v1/users was gated to
// admin/superadmin only. Project team leads are plain app-role "user"s (their
// "lead" status is a per-project membership row), so the assignee picker's
// user list silently came back empty for them.
const PROJECT_ID = "e2e-proj-1"
const SUITE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
const LEAD_ID = "e2e-user-0001"

describe("Assign dialog — project lead access", () => {
  beforeEach(() => {
    cy.login("user")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi(
        "GET",
        `/projects/${PROJECT_ID}`,
        { body: ok({ ...projects[0], members: [{ id: LEAD_ID, name: "Uche Tester", email: "uche.tester@example.com", role: "team_lead" }] }) },
        "project"
      )
    })
    cy.fixture("testmgmt/suites").then((suites) => {
      cy.interceptApi("GET", `/test-suites/${SUITE_ID}`, { body: ok(suites[0]) }, "suite")
    })
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi("GET", "/test-cases", { body: ok(cases, listMeta(cases.length)) }, "cases")
    })
  })

  it("shows management actions to a lead and lists org users in the assignee picker", () => {
    cy.fixture("team/users").then((users) => {
      cy.interceptApi("GET", "/users", { body: ok(users, listMeta(users.length)) }, "users")
    })

    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.wait("@cases")

    // A lead (not a company admin) still gets management actions on their project.
    cy.dataCy("case-assign").should("have.length", 2)

    cy.contains('[data-cy="case-row"]', "Invalid login shows error").within(() => {
      cy.dataCy("case-assign").click()
    })
    cy.wait("@users")

    cy.contains("Assign users").should("be.visible")
    cy.contains("No users found.").should("not.exist")
    cy.contains("Bola Runner").should("be.visible")
    cy.contains("bola.runner@example.com").should("be.visible")
  })

  it("lets a lead assign a user to a test case", () => {
    cy.fixture("team/users").then((users) => {
      cy.interceptApi("GET", "/users", { body: ok(users, listMeta(users.length)) }, "users")
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
    cy.wait("@users")
    cy.contains("Bola Runner").click()
    cy.contains("button", "Assign 1").click()

    cy.wait("@assign")
      .its("request.body")
      .should("deep.equal", { userIds: ["e2e-user-0002"], deadline: null })
    cy.contains("Assignees updated").should("be.visible")
  })

  it("surfaces an error instead of a silent empty list when the users request fails", () => {
    cy.interceptApi("GET", "/users", { statusCode: 403, body: fail("Forbidden", 403) }, "usersForbidden")

    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.wait("@cases")

    cy.contains('[data-cy="case-row"]', "Invalid login shows error").within(() => {
      cy.dataCy("case-assign").click()
    })
    cy.wait("@usersForbidden")

    cy.contains("No users found.").should("not.exist")
    cy.contains("Forbidden").should("be.visible")
  })
})

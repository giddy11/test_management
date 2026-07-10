import { listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"
const SUITE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

describe("Suite detail — test cases", () => {
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

  it("lists test cases with priority, status, and result badges", () => {
    cy.contains("h1", "Authentication").should("be.visible")
    cy.dataCy("case-row").should("have.length", 2)
    cy.contains('[data-cy="case-row"]', "Valid login").within(() => {
      cy.contains("High").should("be.visible")
      cy.contains("Active").should("be.visible")
      cy.contains("Not run").should("be.visible")
      cy.contains("smoke").should("be.visible")
    })
    cy.contains('[data-cy="case-row"]', "Invalid login shows error").within(() => {
      cy.contains("Pass").should("be.visible")
    })
  })

  it("creates a test case with steps split per line", () => {
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi("POST", "/test-cases", { body: ok({ ...cases[0], id: "e2e-case-new" }) }, "createCase")
    })

    cy.dataCy("new-case").click()
    cy.contains("New test case").should("be.visible")
    cy.get("#title").type("Password reset")
    cy.get("#stepsText").type("Request a reset code{enter}Enter the code{enter}Set a new password")
    cy.get("#expectedResult").type("Password is updated and user can sign in")
    cy.get("#tagsText").type("regression, auth")
    cy.dataCy("case-submit").click()

    cy.wait("@createCase").its("request.body").should("deep.include", {
      title: "Password reset",
      steps: ["Request a reset code", "Enter the code", "Set a new password"],
      expectedResult: "Password is updated and user can sign in",
      priority: "Medium",
      status: "Draft",
      suite: SUITE_ID,
      tags: ["regression", "auth"],
    })
    cy.contains("Test case created").should("be.visible")
  })

  it("validates required case fields", () => {
    cy.dataCy("new-case").click()
    cy.dataCy("case-submit").click()
    cy.contains("Title is required").should("be.visible")
    cy.contains("Add at least one step").should("be.visible")
    cy.contains("Expected result is required").should("be.visible")
  })

  it("searches cases through the API (debounced)", () => {
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi("GET", "/test-cases", { body: ok([cases[0]], listMeta(1)) }, "searchCases")
    })
    cy.dataCy("case-search").type("valid")
    cy.wait("@searchCases").its("request.url").should("include", "search=valid")
    cy.dataCy("case-row").should("have.length", 1)
  })

  it("deletes a test case after confirmation", () => {
    cy.interceptApi("DELETE", "/test-cases/e2e-case-2", { body: ok(null) }, "deleteCase")

    cy.contains('[data-cy="case-row"]', "Invalid login shows error").within(() => {
      cy.dataCy("case-delete").click()
    })
    cy.contains("Delete test case").should("be.visible")
    cy.dataCy("confirm-ok").click()

    cy.wait("@deleteCase")
    cy.contains("Test case deleted").should("be.visible")
  })

  it("hides management actions from regular users", () => {
    cy.login("user")
    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.wait("@cases")

    cy.dataCy("new-case").should("not.exist")
    cy.dataCy("case-delete").should("not.exist")
  })
})

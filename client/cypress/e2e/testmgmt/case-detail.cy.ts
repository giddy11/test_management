import { fail, listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"
const SUITE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
const CASE_ID = "e2e-case-1"
const CASE_URL = `/projects/${PROJECT_ID}/suites/${SUITE_ID}/cases/${CASE_ID}`

describe("Test case detail", () => {
  beforeEach(() => {
    cy.login("user")
  })

  it("renders the case with steps, expected result, and tags", () => {
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi("GET", `/test-cases/${CASE_ID}`, { body: ok(cases[0]) }, "case")
    })
    cy.interceptApi("GET", `/test-cases/${CASE_ID}/attachments`, { body: ok([]) }, "attachments")

    cy.visit(CASE_URL)
    cy.wait("@case")

    cy.contains("h1", "Valid login").should("be.visible")
    cy.contains("High").should("be.visible")
    cy.contains("Active").should("be.visible")
    cy.contains("Open the login page").should("be.visible")
    cy.contains("Enter valid credentials").should("be.visible")
    cy.contains("Dashboard is shown").should("be.visible")
    cy.contains("smoke").should("be.visible")
  })

  it("shows a not-found message for a missing case", () => {
    cy.interceptApi(
      "GET",
      `/test-cases/${CASE_ID}`,
      { statusCode: 404, body: fail("Test case not found", 404) },
      "case"
    )
    cy.interceptApi("GET", `/test-cases/${CASE_ID}/attachments`, { body: ok([]) }, "attachments")

    cy.visit(CASE_URL)
    cy.contains("Test case not found.", { timeout: 10000 }).should("be.visible")
  })

  it("navigates back to the suite", () => {
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi("GET", `/test-cases/${CASE_ID}`, { body: ok(cases[0]) }, "case")
      cy.interceptApi("GET", "/test-cases", { body: ok(cases, listMeta(cases.length)) }, "cases")
    })
    cy.interceptApi("GET", `/test-cases/${CASE_ID}/attachments`, { body: ok([]) }, "attachments")
    cy.fixture("testmgmt/suites").then((suites) => {
      cy.interceptApi("GET", `/test-suites/${SUITE_ID}`, { body: ok(suites[0]) }, "suite")
    })
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })

    cy.visit(CASE_URL)
    cy.wait("@case")
    cy.contains("Back to suite").click()
    cy.location("pathname").should("eq", `/projects/${PROJECT_ID}/suites/${SUITE_ID}`)
    cy.contains("h1", "Authentication").should("be.visible")
  })
})

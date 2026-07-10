import { listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"
const BUG_ID = "e2e-bug-1"
const BUG_URL = `/projects/${PROJECT_ID}/bugs/${BUG_ID}`

describe("Bug detail (admin)", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("GET", `/bugs/${BUG_ID}`, { body: ok(bugs[0]) }, "bug")
    })
    cy.interceptApi("GET", `/bugs/${BUG_ID}/attachments`, { body: ok([]) }, "attachments")
    // The manage dialog's assignee picker loads users.
    cy.fixture("team/users").then((users) => {
      cy.interceptApi("GET", "/users", { body: ok(users, listMeta(users.length)) }, "users")
    })
    cy.visit(BUG_URL)
    cy.wait("@bug")
  })

  it("renders the bug report in full", () => {
    cy.contains("h1", "Login button unresponsive on Safari").should("be.visible")
    cy.contains("Open").should("be.visible")
    cy.contains("Major").should("be.visible")
    cy.contains("Reported by Uche Tester").should("be.visible")
    cy.contains("Open the app in Safari").should("be.visible")
    cy.contains("User is signed in").should("be.visible")
    cy.contains("Nothing happens").should("be.visible")
    cy.contains("Safari 17 / macOS").should("be.visible")
  })

  it("transitions the bug status and assigns a user", () => {
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi(
        "PATCH",
        `/bugs/${BUG_ID}`,
        { body: ok({ ...bugs[0], status: "In Progress", assignedTo: { id: "e2e-user-0002", name: "Bola Runner" } }) },
        "manageBug"
      )
    })

    cy.dataCy("bug-manage").click()
    cy.contains("Manage bug").should("be.visible")
    cy.selectDropdown('[data-cy="bug-status"]', "In Progress")
    cy.dataCy("bug-manage-save").click()

    cy.wait("@manageBug").its("request.body").should("deep.equal", {
      status: "In Progress",
      severity: "Major",
      priority: "High",
      assignedToId: null,
    })
    cy.contains("Bug updated").should("be.visible")
  })

  it("deletes the bug and returns to the project", () => {
    cy.interceptApi("DELETE", `/bugs/${BUG_ID}`, { body: ok(null) }, "deleteBug")
    cy.fixture("dashboard/overview").then((overview) => {
      cy.interceptApi("GET", "/dashboard/overview", { body: ok(overview) }, "overview")
    })
    cy.interceptApi("GET", "/test-suites", { body: ok([], listMeta(0)) }, "suites")

    cy.dataCy("bug-delete").click()
    cy.contains("Delete bug").should("be.visible")
    cy.dataCy("confirm-ok").click()

    cy.wait("@deleteBug")
    cy.contains("Bug deleted").should("be.visible")
    cy.location("pathname").should("eq", `/projects/${PROJECT_ID}`)
  })
})

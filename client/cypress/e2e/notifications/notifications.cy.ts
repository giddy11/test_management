import { listMeta, ok } from "../../support/api"

describe("Notifications", () => {
  beforeEach(() => {
    cy.login("user")
    cy.stubDashboard()
    // Override the cy.login() defaults with real content — later intercepts win.
    cy.interceptApi("GET", "/notifications/unread-count", { body: ok({ count: 1 }) }, "unread")
    cy.fixture("notifications/list").then((items) => {
      cy.interceptApi("GET", "/notifications", { body: ok(items, listMeta(items.length)) }, "list")
    })
    cy.visit("/dashboard")
    cy.wait("@overview")
  })

  it("shows the unread badge and lists notifications on open", () => {
    cy.dataCy("notification-bell").should("contain", "1").click()
    cy.wait("@list")
    cy.dataCy("notification-item").should("have.length", 2)
    cy.contains("You were assigned 3 test cases").should("be.visible")
    cy.contains("Release 1.4 run completed").should("be.visible")
  })

  it("marks a notification read and navigates to its target", () => {
    cy.interceptApi("PATCH", "/notifications/e2e-notif-1/read", { body: ok(null) }, "markRead")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", "/projects/e2e-proj-1", { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.interceptApi("GET", "/test-suites", { body: ok([], listMeta(0)) }, "suites")

    cy.dataCy("notification-bell").click()
    cy.wait("@list")
    cy.contains('[data-cy="notification-item"]', "You were assigned 3 test cases").click()

    cy.wait("@markRead")
    // The fixture has projectId + suiteId but no caseId, so linkFor() routes
    // to the project page.
    cy.location("pathname").should("eq", "/projects/e2e-proj-1")
  })

  it("marks all notifications read", () => {
    cy.interceptApi("PATCH", "/notifications/read-all", { body: ok(null) }, "markAll")

    cy.dataCy("notification-bell").click()
    cy.wait("@list")
    cy.contains("button", "Mark all read").click()

    cy.wait("@markAll")
  })

  it("shows the empty state when there is nothing", () => {
    cy.interceptApi("GET", "/notifications/unread-count", { body: ok({ count: 0 }) }, "unreadEmpty")
    cy.interceptApi("GET", "/notifications", { body: ok([], listMeta(0)) }, "emptyList")

    cy.dataCy("notification-bell").click()
    cy.wait("@emptyList")
    cy.contains("You're all caught up.").should("be.visible")
  })
})

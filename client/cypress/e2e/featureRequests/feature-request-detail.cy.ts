import { listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"
const FR_ID = "e2e-fr-1"
const FR_URL = `/projects/${PROJECT_ID}/feature-requests/${FR_ID}`

describe("Feature request detail (admin)", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.fixture("featureRequests/list").then((requests) => {
      cy.interceptApi("GET", `/feature-requests/${FR_ID}`, { body: ok(requests[0]) }, "request")
    })
    cy.interceptApi("GET", `/feature-requests/${FR_ID}/attachments`, { body: ok([]) }, "attachments")
    cy.interceptApi(
      "GET",
      `/feature-requests/${FR_ID}/history`,
      {
        body: ok([
          { status: "new", enteredAt: "2026-07-14T09:00:00.000Z" },
          { status: "under_review", enteredAt: "2026-07-15T10:30:00.000Z" },
        ]),
      },
      "history"
    )
    cy.visit(FR_URL)
    cy.wait("@request")
  })

  it("shows the status timeline with time spent in each status", () => {
    cy.contains("Status timeline").should("be.visible")
    cy.dataCy("timeline-entry").should("have.length", 2)
    cy.dataCy("timeline-entry").first().should("contain", "New").and("contain", "1d 1h")
    cy.dataCy("timeline-entry").last().should("contain", "Under Review").and("contain", "so far")
  })

  it("shows no running clock once the request is done", () => {
    cy.interceptApi(
      "GET",
      `/feature-requests/${FR_ID}/history`,
      {
        body: ok([
          { status: "new", enteredAt: "2026-07-14T09:00:00.000Z" },
          { status: "done", enteredAt: "2026-07-16T09:00:00.000Z" },
        ]),
      },
      "doneHistory"
    )
    cy.visit(FR_URL)
    cy.wait("@doneHistory")

    cy.dataCy("timeline-entry").last().should("contain", "Done").and("not.contain", "so far")
  })

  it("renders the request with status and submitter", () => {
    cy.contains("h1", "Dark mode for reports").should("be.visible")
    cy.contains("Under Review").should("be.visible")
    cy.contains("Submitted by Uche Tester").should("be.visible")
    cy.contains("Exported reports should respect the dark theme.").should("be.visible")
  })

  it("moves the request to a new status with a team response", () => {
    cy.fixture("featureRequests/list").then((requests) => {
      cy.interceptApi(
        "PATCH",
        `/feature-requests/${FR_ID}`,
        { body: ok({ ...requests[0], status: "planned", adminResponse: "Scheduled for Q3." }) },
        "updateStatus"
      )
    })

    cy.dataCy("fr-update-status").click()
    cy.contains("Update status").should("be.visible")
    cy.selectDropdown('[data-cy="fr-status"]', "Planned")
    cy.get("#adminResponse").type("Scheduled for Q3.")
    cy.dataCy("fr-status-save").click()

    cy.wait("@updateStatus").its("request.body").should("deep.equal", {
      status: "planned",
      adminResponse: "Scheduled for Q3.",
    })
    cy.contains("Feature request updated").should("be.visible")
  })

  it("only offers the current status and later ones — no going back", () => {
    // The fixture request is Under Review.
    cy.dataCy("fr-update-status").click()
    cy.dataCy("fr-status").click()

    cy.contains('[role="option"]', "New").should("have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Under Review").should("not.have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Planned").should("not.have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "In Progress").should("not.have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Done").should("not.have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Rejected").should("not.have.attr", "aria-disabled", "true")
  })

  it("locks the status once the request is done", () => {
    cy.fixture("featureRequests/list").then((requests) => {
      cy.interceptApi("GET", `/feature-requests/${FR_ID}`, { body: ok({ ...requests[0], status: "done" }) }, "doneRequest")
    })
    cy.visit(FR_URL)
    cy.wait("@doneRequest")

    cy.dataCy("fr-update-status").click()
    cy.contains("Done is final").should("be.visible")
    cy.dataCy("fr-status").click()
    cy.contains('[role="option"]', "In Progress").should("have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Rejected").should("have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Done").should("not.have.attr", "aria-disabled", "true")
  })

  it("deletes the request and returns to the project", () => {
    cy.interceptApi("DELETE", `/feature-requests/${FR_ID}`, { body: ok(null) }, "deleteRequest")
    cy.fixture("dashboard/overview").then((overview) => {
      cy.interceptApi("GET", "/dashboard/overview", { body: ok(overview) }, "overview")
    })
    cy.interceptApi("GET", "/test-suites", { body: ok([], listMeta(0)) }, "suites")

    cy.dataCy("fr-delete").click()
    cy.contains("Delete feature request").should("be.visible")
    cy.dataCy("confirm-ok").click()

    cy.wait("@deleteRequest")
    cy.contains("Feature request deleted").should("be.visible")
    cy.location("pathname").should("eq", `/projects/${PROJECT_ID}`)
  })
})

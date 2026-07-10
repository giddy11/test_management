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
    cy.visit(FR_URL)
    cy.wait("@request")
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

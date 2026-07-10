import { listMeta, ok } from "../../support/api"

// Render coverage for the admin/superadmin utility pages. Deep flows for
// announcements (bulk publish) are future work — see cypress/README.md.
describe("Activity log (admin)", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.interceptApi("GET", "/users", { body: ok([], listMeta(0)) }, "users")
  })

  it("renders activity entries", () => {
    cy.interceptApi(
      "GET",
      "/activity",
      {
        body: ok(
          [
            {
              id: "e2e-act-1",
              entityType: "project",
              action: "project.created",
              summary: "Ada Admin created project Apollo",
              actor: { id: "e2e-admin-0001", name: "Ada Admin" },
              data: { projectId: "e2e-proj-1" },
              createdAt: "2026-07-10T08:00:00.000Z",
            },
          ],
          listMeta(1)
        ),
      },
      "activity"
    )

    cy.visit("/activity")
    cy.wait("@activity")
    cy.contains("h1", "Activity log").should("be.visible")
    cy.contains("Ada Admin created project Apollo").should("be.visible")
  })

  it("shows the empty state", () => {
    cy.interceptApi("GET", "/activity", { body: ok([], listMeta(0)) }, "activity")

    cy.visit("/activity")
    cy.wait("@activity")
    cy.contains("No activity yet.").should("be.visible")
  })
})

describe("Organisations (superadmin)", () => {
  it("lists every organisation with counts", () => {
    cy.login("superadmin")
    cy.interceptApi(
      "GET",
      "/organizations",
      {
        body: ok(
          [
            {
              organizationId: "e2e-org-1",
              name: "Acme QA",
              ownerName: "Ada Admin",
              ownerEmail: "ada.admin@example.com",
              userCount: 5,
              projectCount: 3,
              createdAt: "2026-01-10T09:00:00.000Z",
            },
          ],
          listMeta(1)
        ),
      },
      "organizations"
    )

    cy.visit("/platform")
    cy.wait("@organizations")
    cy.contains("h1", "Organisations").should("be.visible")
    cy.contains("Acme QA").should("be.visible")
    cy.contains("ada.admin@example.com").should("be.visible")
  })
})

describe("Announcements (superadmin)", () => {
  it("renders the page with the current banner and updates", () => {
    cy.login("superadmin")
    cy.interceptApi("GET", "/site-banner/current", { body: ok(null) }, "banner")
    cy.interceptApi(
      "GET",
      "/app-updates",
      { body: ok([], listMeta(0)) },
      "updates"
    )

    cy.visit("/announcements")
    cy.wait("@updates")
    cy.contains("h1", "Announcements").should("be.visible")
  })
})

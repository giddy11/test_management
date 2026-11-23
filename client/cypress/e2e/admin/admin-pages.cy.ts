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

describe("Pricing (superadmin)", () => {
  it("turns a plan off and drops it from the preview", () => {
    cy.login("superadmin")
    cy.fixture("pricing/public").then((content) => {
      cy.interceptApi("GET", "/pricing", { body: ok({ content, isDefault: true, updatedAt: null }) }, "pricingOff")
    })
    cy.visit("/pricing-settings")
    cy.wait("@pricingOff")
    cy.dataCy("pricing-plan-visible-0").click()
    cy.dataCy("pricing-editor-plan-0").should("contain.text", "Hidden")
    cy.contains("[role=tab]", "Preview").click()
    cy.dataCy("pricing-preview").find('[data-cy="pricing-plan-free"]').should("not.exist")
    cy.dataCy("pricing-preview").find('[data-cy="pricing-plan-standard"]').should("exist")
  })

  beforeEach(() => {
    cy.login("superadmin")
    cy.fixture("pricing/public").then((content) => {
      cy.interceptApi("GET", "/pricing", { body: ok({ content, isDefault: true, updatedAt: null }) }, "pricing")
    })
  })

  it("edits a plan's feature, previews it and saves", () => {
    cy.fixture("pricing/public").then((content) => {
      cy.interceptApi(
        "PUT",
        "/pricing",
        { body: ok({ content, isDefault: false, updatedAt: new Date().toISOString() }) },
        "savePricing"
      )
    })

    cy.visit("/pricing-settings")
    cy.wait("@pricing")
    cy.contains("h1", "Pricing").should("be.visible")
    cy.dataCy("pricing-status").should("contain.text", "built-in defaults")
    cy.dataCy("pricing-save").should("be.disabled")

    cy.dataCy("pricing-editor-plan-1").find('input[aria-label="Feature 1"]').clear().type("Unlimited projects")
    cy.dataCy("pricing-save").should("not.be.disabled")

    cy.contains("[role=tab]", "Preview").click()
    cy.dataCy("pricing-preview").should("contain.text", "Unlimited projects")

    cy.dataCy("pricing-save").click()
    cy.wait("@savePricing").its("request.body.plans.1.features.0").should("eq", "Unlimited projects")
  })
})

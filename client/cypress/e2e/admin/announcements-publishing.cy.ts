import { listMeta, ok } from "../../support/api"

const ACTIVE_BANNER = {
  message: "Maintenance tonight at 10pm",
  isActive: true,
  expiresAt: "2026-07-11T22:00:00.000Z",
  audience: "all",
  recipientIds: null,
  durationMinutes: 60,
}

describe("Announcements publishing (superadmin)", () => {
  beforeEach(() => {
    cy.login("superadmin")
    cy.interceptApi("GET", "/users", { body: ok([], listMeta(0)) }, "users")
    cy.interceptApi("GET", "/app-updates", { body: ok([]) }, "updates")
  })

  it("turns the site-wide banner on", () => {
    cy.interceptApi("GET", "/site-banner/current", { body: ok(null) }, "banner")
    cy.interceptApi("POST", "/site-banner/activate", { body: ok(ACTIVE_BANNER) }, "activate")

    cy.visit("/announcements")
    cy.wait("@banner")

    cy.dataCy("banner-on").should("be.disabled")
    cy.get("#banner-message").type("Maintenance tonight at 10pm")
    cy.dataCy("banner-on").should("be.enabled").click()

    cy.wait("@activate").its("request.body").should("deep.include", {
      message: "Maintenance tonight at 10pm",
      durationMinutes: 60,
      audience: "all",
    })
    cy.contains("Banner is live").should("be.visible")
    // The card flips into "active" mode showing the message and a turn-off button.
    cy.dataCy("banner-off").should("be.visible")
  })

  it("turns an active banner off", () => {
    cy.interceptApi("GET", "/site-banner/current", { body: ok(ACTIVE_BANNER) }, "banner")
    cy.interceptApi(
      "POST",
      "/site-banner/deactivate",
      { body: ok({ ...ACTIVE_BANNER, isActive: false, message: null }) },
      "deactivate"
    )

    cy.visit("/announcements")
    cy.wait("@banner")

    cy.contains("Maintenance tonight at 10pm").should("be.visible")
    cy.dataCy("banner-off").click()

    cy.wait("@deactivate")
    cy.contains("Banner turned off").should("be.visible")
    cy.dataCy("banner-on").should("exist")
  })

  it("publishes a what's-new update", () => {
    cy.interceptApi("GET", "/site-banner/current", { body: ok(null) }, "banner")
    cy.interceptApi(
      "POST",
      "/app-updates/bulk",
      { body: ok([{ id: "e2e-update-1", title: "Dark mode", body: "The app now has a dark theme.", createdAt: "2026-07-10T09:00:00.000Z" }]) },
      "publish"
    )

    cy.visit("/announcements")
    cy.wait("@updates")

    cy.dataCy("publish-updates").should("be.disabled")
    cy.get('input[id^="ann-title-"]').first().type("Dark mode")
    cy.get('textarea[id^="ann-body-"]').first().type("The app now has a dark theme.")
    cy.dataCy("publish-updates").should("be.enabled").click()

    cy.wait("@publish").its("request.body.items").should("deep.equal", [
      { title: "Dark mode", body: "The app now has a dark theme.", audience: "admins" },
    ])
    cy.contains("Published — recipients will see it on their next visit").should("be.visible")
  })

  it("lists previously published updates", () => {
    cy.interceptApi("GET", "/site-banner/current", { body: ok(null) }, "banner")
    cy.interceptApi(
      "GET",
      "/app-updates",
      { body: ok([{ id: "e2e-update-1", title: "Export to XLSX", body: "Suites can now be exported.", createdAt: "2026-07-01T09:00:00.000Z" }]) },
      "updates"
    )

    cy.visit("/announcements")
    cy.wait("@updates")
    cy.contains("Published (1)").should("be.visible")
    cy.contains("Export to XLSX").should("be.visible")
  })
})

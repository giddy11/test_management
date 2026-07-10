import { ok } from "../../support/api"

// The "Getting started" tour (driver.js) auto-starts for a company admin who
// has not completed onboarding. Closing it — via X or Done — marks
// onboarding complete through PATCH /auth/onboarding.
describe("Onboarding tour", () => {
  it("auto-starts for a first-time company admin", () => {
    cy.login("admin", { onboardingCompleted: false })
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.wait("@overview")

    cy.get(".driver-popover", { timeout: 10000 }).should("be.visible")
  })

  it("persists completion when the tour is dismissed", () => {
    cy.login("admin", { onboardingCompleted: false })
    cy.stubDashboard()
    cy.fixture("users/admin").then((admin) => {
      cy.interceptApi(
        "PATCH",
        "/auth/onboarding",
        { body: ok({ ...admin, onboardingCompleted: true }) },
        "onboarding"
      )
    })
    cy.visit("/dashboard")
    cy.wait("@overview")

    cy.get(".driver-popover", { timeout: 10000 }).should("be.visible")
    cy.get(".driver-popover-close-btn").click()

    cy.wait("@onboarding").its("request.body.completed").should("eq", true)
    cy.get(".driver-popover").should("not.exist")
  })

  it("does not start again for an admin who completed onboarding", () => {
    cy.login("admin") // fixture default: onboardingCompleted = true
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.wait("@overview")

    cy.contains("Welcome back, Ada").should("be.visible")
    cy.get(".driver-popover").should("not.exist")
  })

  it("never starts for regular users", () => {
    cy.login("user", { onboardingCompleted: false })
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.wait("@overview")

    cy.contains("Welcome back, Uche").should("be.visible")
    cy.get(".driver-popover").should("not.exist")
  })
})

// Opt-in live smoke test — SKIPPED unless real credentials are provided:
//
//   CYPRESS_TEST_USER_EMAIL / CYPRESS_TEST_USER_PASSWORD  — an existing account
//   CYPRESS_apiUrl                                        — a reachable API
//
// The rest of the suite is fully stubbed on purpose: dev and prod share one
// database, so E2E must not write to it. This spec only logs in and reads the
// dashboard — keep it read-only.
const email = Cypress.env("TEST_USER_EMAIL") as string | undefined
const password = Cypress.env("TEST_USER_PASSWORD") as string | undefined

const describeLive = email && password ? describe : describe.skip

describeLive("Live login smoke (read-only)", () => {
  it("logs in via the API and loads the real dashboard", () => {
    cy.loginByApi(email!, password!)
    cy.visit("/dashboard")
    cy.waitForLoader()
    cy.contains("Welcome back").should("be.visible")
  })
})

describe("Session and route protection", () => {
  it("redirects unauthenticated visitors from a protected route to /login", () => {
    cy.visit("/dashboard")
    cy.location("pathname").should("eq", "/login")
  })

  it("keeps the session across a page reload", () => {
    cy.login("user")
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.wait("@overview")
    cy.contains("Welcome back, Uche").should("be.visible")

    cy.reload()
    cy.location("pathname").should("eq", "/dashboard")
    cy.contains("Welcome back, Uche").should("be.visible")
  })

  it("sends users with an unverified email to /verify-email", () => {
    cy.login("user", { isEmailVerified: false })
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.location("pathname").should("eq", "/verify-email")
  })
})

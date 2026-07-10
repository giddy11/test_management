import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../../support/api"

describe("Logout", () => {
  it("logs out from the sidebar user menu and clears the session", () => {
    cy.login("user")
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.wait("@me")

    cy.logout()

    cy.location("pathname").should("eq", "/login")
    cy.window().then((win) => {
      expect(win.localStorage.getItem(ACCESS_TOKEN_KEY)).to.be.null
      expect(win.localStorage.getItem(REFRESH_TOKEN_KEY)).to.be.null
    })
  })
})

describe("Role-based access control", () => {
  it("hides admin navigation from regular users and blocks /team", () => {
    cy.login("user")
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.wait("@overview")

    cy.dataCy("nav-team").should("not.exist")
    cy.dataCy("nav-activity").should("not.exist")
    cy.dataCy("nav-platform").should("not.exist")

    cy.visit("/team")
    cy.location("pathname").should("eq", "/dashboard")
  })

  it("shows Team and Activity to company admins but not platform pages", () => {
    cy.login("admin")
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.wait("@overview")

    cy.dataCy("nav-team").should("be.visible")
    cy.dataCy("nav-activity").should("be.visible")
    cy.dataCy("nav-platform").should("not.exist")
    cy.dataCy("nav-announcements").should("not.exist")

    cy.visit("/platform")
    cy.location("pathname").should("eq", "/dashboard")
  })

  it("shows platform navigation to superadmins", () => {
    cy.login("superadmin")
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.wait("@overview")

    cy.dataCy("nav-platform").should("be.visible")
    cy.dataCy("nav-announcements").should("be.visible")
  })
})

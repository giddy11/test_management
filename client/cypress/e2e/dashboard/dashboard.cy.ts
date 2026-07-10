describe("Dashboard", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.wait("@overview")
  })

  it("greets the user and shows the stat cards from the API", () => {
    cy.contains("Welcome back, Ada").should("be.visible")
    cy.dataCy("stat-projects").should("contain", "3")
    cy.dataCy("stat-test-suites").should("contain", "5")
    cy.dataCy("stat-test-cases").should("contain", "42")
    cy.dataCy("stat-test-runs").should("contain", "7")
  })

  it("shows the projects breakdown with links to each project", () => {
    cy.contains("Projects breakdown").should("be.visible")
    cy.contains("Apollo").should("be.visible")
    cy.contains("Hermes").should("be.visible")
    cy.contains("Zephyr").should("be.visible")
  })

  it("shows the admin-only oversight sections", () => {
    cy.contains("Feature requests").should("be.visible")
    cy.contains("Bug fixes").should("be.visible")
    cy.contains("Top performers").should("be.visible")
    cy.contains("Uche Tester").should("be.visible")
  })

  it("navigates to Projects via the sidebar", () => {
    cy.dataCy("nav-projects").click()
    cy.wait("@projects")
    cy.location("pathname").should("eq", "/projects")
    cy.contains("h1", "Projects").should("be.visible")
  })

  it("navigates to Settings via the sidebar", () => {
    cy.dataCy("nav-settings").click()
    cy.location("pathname").should("eq", "/settings")
    cy.contains("h1", "Settings").should("be.visible")
  })
})

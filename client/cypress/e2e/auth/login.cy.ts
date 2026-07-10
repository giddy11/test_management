import { fail, ok } from "../../support/api"

describe("Login", () => {
  beforeEach(() => {
    cy.visit("/login")
  })

  it("renders the login form", () => {
    cy.contains("Sign in to your account").should("be.visible")
    cy.dataCy("login-email").should("be.visible")
    cy.dataCy("login-password").should("be.visible")
    cy.dataCy("login-submit").should("be.enabled")
  })

  it("shows client-side validation errors on an empty submit", () => {
    cy.dataCy("login-submit").click()
    cy.contains("Enter a valid email").should("be.visible")
    cy.contains("Password is required").should("be.visible")
  })

  it("shows an error toast for invalid credentials and stays on /login", () => {
    cy.interceptApi(
      "POST",
      "/auth/login",
      { statusCode: 401, body: fail("Invalid email or password", 401) },
      "login"
    )

    cy.dataCy("login-email").type("uche.tester@example.com")
    cy.dataCy("login-password").type("WrongPassword1")
    cy.dataCy("login-submit").click()

    cy.wait("@login")
    cy.contains("Invalid email or password").should("be.visible")
    cy.location("pathname").should("eq", "/login")
  })

  it("logs in through the form and lands on the dashboard", () => {
    cy.stubLayout()
    cy.stubDashboard()
    cy.fixture("users/user").then((user) => {
      cy.interceptApi(
        "POST",
        "/auth/login",
        {
          body: ok({
            user,
            tokens: { accessToken: "e2e-access-token", refreshToken: "e2e-refresh-token", expiresIn: 900 },
          }),
        },
        "login"
      )
      cy.intercept("GET", /\/api\/v1\/auth\/me$/, { body: ok(user) }).as("me")
    })

    cy.dataCy("login-email").type("uche.tester@example.com")
    cy.dataCy("login-password").type("CorrectHorse1")
    cy.dataCy("login-submit").click()

    cy.wait("@login")
    cy.location("pathname").should("eq", "/dashboard")
    cy.contains("Welcome back, Uche").should("be.visible")
  })
})

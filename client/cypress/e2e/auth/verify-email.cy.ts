import { fail, ok } from "../../support/api"

describe("Verify email", () => {
  beforeEach(() => {
    cy.login("user", { isEmailVerified: false })
    cy.visit("/verify-email")
    cy.wait("@me")
  })

  it("shows the code form addressed to the user's email", () => {
    cy.contains("Verify your email").should("be.visible")
    cy.contains("uche.tester@example.com").should("be.visible")
    cy.get("#code").should("be.visible")
  })

  it("validates the 6-digit code format", () => {
    cy.get("#code").type("12")
    cy.dataCy("verify-submit").click()
    cy.contains("Enter the 6-digit code").should("be.visible")
  })

  it("verifies the code and unlocks the dashboard", () => {
    cy.stubDashboard()
    cy.fixture("users/user").then((user) => {
      cy.interceptApi("POST", "/auth/verify-email", { body: ok({ ...user, isEmailVerified: true }) }, "verify")
    })

    cy.get("#code").type("123456")
    cy.dataCy("verify-submit").click()

    cy.wait("@verify").its("request.body").should("deep.equal", {
      email: "uche.tester@example.com",
      code: "123456",
    })
    cy.location("pathname").should("eq", "/dashboard")
    cy.contains("Welcome back, Uche").should("be.visible")
  })

  it("shows an error for a wrong code", () => {
    cy.interceptApi(
      "POST",
      "/auth/verify-email",
      { statusCode: 400, body: fail("Incorrect or expired code", 400) },
      "verify"
    )

    cy.get("#code").type("999999")
    cy.dataCy("verify-submit").click()

    cy.wait("@verify")
    cy.contains("Incorrect or expired code").should("be.visible")
    cy.location("pathname").should("eq", "/verify-email")
  })

  it("resends the verification code", () => {
    cy.interceptApi("POST", "/auth/resend-verification", { body: ok(null) }, "resend")

    cy.dataCy("verify-resend").click()

    cy.wait("@resend").its("request.body.email").should("eq", "uche.tester@example.com")
    cy.contains("A new code has been sent").should("be.visible")
  })
})

import { fail, ok } from "../../support/api"

describe("Reset password", () => {
  beforeEach(() => {
    cy.visit("/reset-password")
  })

  it("validates all fields before submitting", () => {
    cy.dataCy("reset-submit").click()
    cy.contains("Enter a valid email").should("be.visible")
    cy.contains("Enter the 6-digit code").should("be.visible")
    cy.contains("At least 8 characters").should("be.visible")
  })

  it("resets the password and returns to login", () => {
    cy.interceptApi("POST", "/auth/reset-password", { body: ok(null) }, "reset")

    cy.get("#email").type("uche.tester@example.com")
    cy.get("#code").type("123456")
    cy.get("#newPassword").type("BrandNewPass1")
    cy.dataCy("reset-submit").click()

    cy.wait("@reset").its("request.body").should("deep.equal", {
      email: "uche.tester@example.com",
      code: "123456",
      newPassword: "BrandNewPass1",
    })
    cy.contains("Password reset — sign in with your new password").should("be.visible")
    cy.location("pathname").should("eq", "/login")
  })

  it("surfaces an invalid-code error and stays on the page", () => {
    cy.interceptApi(
      "POST",
      "/auth/reset-password",
      { statusCode: 400, body: fail("Invalid or expired code", 400) },
      "reset"
    )

    cy.get("#email").type("uche.tester@example.com")
    cy.get("#code").type("000000")
    cy.get("#newPassword").type("BrandNewPass1")
    cy.dataCy("reset-submit").click()

    cy.wait("@reset")
    cy.contains("Invalid or expired code").should("be.visible")
    cy.location("pathname").should("eq", "/reset-password")
  })
})

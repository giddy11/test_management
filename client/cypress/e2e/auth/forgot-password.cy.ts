import { ok } from "../../support/api"

describe("Forgot password", () => {
  beforeEach(() => {
    cy.visit("/forgot-password")
  })

  it("validates the email before submitting", () => {
    cy.dataCy("forgot-submit").click()
    cy.contains("Enter a valid email").should("be.visible")
  })

  it("requests a reset code and moves to the reset page", () => {
    cy.interceptApi("POST", "/auth/forgot-password", { body: ok(null) }, "forgot")

    cy.dataCy("forgot-email").type("uche.tester@example.com")
    cy.dataCy("forgot-submit").click()

    cy.wait("@forgot").its("request.body.email").should("eq", "uche.tester@example.com")
    cy.contains("a reset code has been sent").should("be.visible")
    cy.location("pathname").should("eq", "/reset-password")
  })
})

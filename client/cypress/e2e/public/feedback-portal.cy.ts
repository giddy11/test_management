import { fail, ok } from "../../support/api"

const TOKEN = "e2e-feedback-token"

describe("Public feedback portal", () => {
  it("shows an unavailable message for a disabled or unknown link", () => {
    cy.interceptApi(
      "GET",
      `/public/feedback/${TOKEN}`,
      { statusCode: 404, body: fail("Feedback form not found", 404) },
      "form"
    )

    cy.visit(`/feedback/${TOKEN}`)
    cy.wait("@form")
    cy.contains("This ticket form is not available.").should("be.visible")
  })

  it("renders the form without any login", () => {
    cy.interceptApi(
      "GET",
      `/public/feedback/${TOKEN}`,
      { body: ok({ projectName: "Apollo", suites: [{ id: "s1", name: "Authentication" }] }) },
      "form"
    )

    cy.visit(`/feedback/${TOKEN}`)
    cy.wait("@form")
    cy.contains("Apollo — Raise a Ticket").should("be.visible")
    cy.get("#fb-name").should("be.visible")
    cy.get("#fb-email").should("be.visible")
  })

  it("submits feedback and shows the thank-you state", () => {
    cy.interceptApi(
      "GET",
      `/public/feedback/${TOKEN}`,
      { body: ok({ projectName: "Apollo", suites: [] }) },
      "form"
    )
    cy.interceptApi("POST", `/public/feedback/${TOKEN}`, { body: ok({ id: "e2e-fb-1" }) }, "submit")

    cy.visit(`/feedback/${TOKEN}`)
    cy.wait("@form")

    cy.get("#fb-name").type("External User")
    cy.get("#fb-email").type("external.user@example.com")
    cy.get("#fb-title").type("Add CSV export")
    cy.get("#fb-description").type("We need to export results as CSV for our reports.")
    cy.contains("button", "Raise ticket").click()

    cy.wait("@submit").then(({ request }) => {
      // Multipart body — assert the text fields made it into the payload.
      expect(String(request.body)).to.include("Add CSV export")
      expect(String(request.body)).to.include("external.user@example.com")
    })
    cy.contains("Thank you!").should("be.visible")
    cy.contains("Your ticket for Apollo has been logged").should("be.visible")

    // "Submit another response" resets the form.
    cy.contains("button", "Submit another response").click()
    cy.get("#fb-title").should("have.value", "")
  })

  it("surfaces a submission error without losing the form", () => {
    cy.interceptApi(
      "GET",
      `/public/feedback/${TOKEN}`,
      { body: ok({ projectName: "Apollo", suites: [] }) },
      "form"
    )
    cy.interceptApi(
      "POST",
      `/public/feedback/${TOKEN}`,
      { statusCode: 429, body: fail("Too many submissions — try again later", 429) },
      "submit"
    )

    cy.visit(`/feedback/${TOKEN}`)
    cy.wait("@form")

    cy.get("#fb-name").type("External User")
    cy.get("#fb-email").type("external.user@example.com")
    cy.get("#fb-title").type("Add CSV export")
    cy.get("#fb-description").type("Details here.")
    cy.contains("button", "Raise ticket").click()

    cy.wait("@submit")
    cy.contains("Too many submissions").should("be.visible")
    cy.get("#fb-title").should("have.value", "Add CSV export")
  })
})

import { ok } from "../../support/api"

describe("Settings", () => {
  beforeEach(() => {
    cy.login("user")
    cy.stubDashboard() // the Help tab fetches projects; harmless elsewhere
    cy.visit("/settings")
    cy.wait("@me")
  })

  describe("Profile", () => {
    it("prefills the form and keeps Save disabled until something changes", () => {
      cy.get("#firstName").should("have.value", "Uche")
      cy.get("#lastName").should("have.value", "Tester")
      cy.get("#email").should("have.value", "uche.tester@example.com").and("have.attr", "readonly")
      cy.dataCy("profile-save").should("be.disabled")
    })

    it("updates the profile and confirms with a toast", () => {
      cy.fixture("users/user").then((user) => {
        cy.interceptApi(
          "PATCH",
          "/auth/profile",
          { body: ok({ ...user, firstName: "Uchechi", name: "Uchechi Tester" }) },
          "updateProfile"
        )
      })

      cy.get("#firstName").clear().type("Uchechi")
      cy.dataCy("profile-save").should("be.enabled").click()

      cy.wait("@updateProfile").its("request.body.firstName").should("eq", "Uchechi")
      cy.contains("Profile updated").should("be.visible")
    })
  })

  describe("Change password", () => {
    beforeEach(() => {
      cy.dataCy("settings-tab-security").click()
    })

    it("flags a weak new password", () => {
      cy.get("#currentPassword").type("OldPassword1")
      cy.get("#newPassword").type("weak")
      cy.get("#confirmPassword").type("weak")
      cy.dataCy("password-submit").click()
      cy.contains("At least 8 characters").should("be.visible")
    })

    it("keeps submit disabled while the confirmation does not match", () => {
      cy.get("#currentPassword").type("OldPassword1")
      cy.get("#newPassword").type("NewPassword1")
      cy.get("#confirmPassword").type("Different1")
      cy.contains("Passwords do not match").should("be.visible")
      cy.dataCy("password-submit").should("be.disabled")
    })

    it("changes the password and logs the user out everywhere", () => {
      cy.interceptApi("PATCH", "/auth/change-password", { body: ok(null) }, "changePassword")

      cy.get("#currentPassword").type("OldPassword1")
      cy.get("#newPassword").type("NewPassword1")
      cy.get("#confirmPassword").type("NewPassword1")
      cy.dataCy("password-submit").click()

      cy.wait("@changePassword")
        .its("request.body")
        .should("deep.equal", { currentPassword: "OldPassword1", newPassword: "NewPassword1" })
      cy.contains("Password changed").should("be.visible")
      // The page clears the session ~1.5s after success.
      cy.location("pathname", { timeout: 10000 }).should("eq", "/login")
    })
  })
})

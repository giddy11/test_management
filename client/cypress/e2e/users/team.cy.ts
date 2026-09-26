import { fail, listMeta, ok } from "../../support/api"

// The user dialog assigns roles from the same list the Roles & access tab
// edits, so the dialog loads /access/roles whenever the actor holds
// role.assign — which the admin fixture does.
const ROLES = [
  {
    id: "role-admin", key: "org_admin", name: "Organisation administrator",
    description: "The everyday owner of this organisation.",
    isBuiltin: true, isLocked: false,
    permissions: ["user.read", "user.create"], permissionCount: 2, memberCount: 1,
  },
  {
    id: "role-qa", key: "qa_engineer", name: "QA engineer",
    description: "Writes and runs tests.",
    isBuiltin: true, isLocked: false,
    permissions: ["project.read"], permissionCount: 1, memberCount: 2,
  },
]

describe("Team management", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.fixture("team/users").then((users) => {
      cy.interceptApi("GET", "/users", { body: ok(users, listMeta(users.length)) }, "users")
    })
    cy.interceptApi("GET", "/access/roles", { body: ok(ROLES) }, "roles")
    cy.visit("/team")
    cy.wait("@users")
    cy.wait("@roles")
  })

  it("lists users with roles and guards owner actions", () => {
    cy.dataCy("user-row").should("have.length", 3)
    cy.contains('[data-cy="user-row"]', "Ada Admin").within(() => {
      cy.contains("Owner").should("be.visible")
      // The owner (self) can be edited but never deactivated.
      cy.dataCy("user-edit").should("exist")
      cy.dataCy("user-deactivate").should("not.exist")
    })
    cy.contains('[data-cy="user-row"]', "Uche Tester").within(() => {
      cy.dataCy("user-edit").should("exist")
      cy.dataCy("user-deactivate").should("exist")
    })
  })

  it("searches users through the API", () => {
    cy.fixture("team/users").then((users) => {
      cy.interceptApi("GET", "/users", { body: ok([users[1]], listMeta(1)) }, "searchUsers")
    })
    cy.dataCy("team-search").type("uche")
    cy.dataCy("user-row").should("have.length", 1)
    cy.contains("Uche Tester").should("be.visible")
    // One request per keystroke — the full term must reach the API eventually.
    cy.get("@searchUsers.all").should((calls) => {
      const urls = (calls as unknown as { request: { url: string } }[]).map((c) => c.request.url)
      expect(urls.some((u) => u.includes("search=uche")), `saw ${urls.length} search calls`).to.be.true
    })
  })

  it("creates a user with a role", () => {
    cy.fixture("team/users").then((users) => {
      cy.interceptApi(
        "POST",
        "/users",
        { body: ok({ ...users[2], id: "e2e-user-new", name: "Chi Dev", email: "chi.dev@example.com" }) },
        "createUser"
      )
    })

    cy.dataCy("add-user").click()
    cy.contains("Add a new user").should("be.visible")
    cy.get("#firstName").type("Chi")
    cy.get("#lastName").type("Dev")
    cy.get("#email").type("chi.dev@example.com")
    cy.get("#password").type("Welcome123")
    // Assigning the organisation-administrator role is what makes the legacy
    // users.role field "admin" — the dialog derives it rather than asking twice.
    cy.dataCy("assign-role-org_admin").click()
    cy.dataCy("user-submit").click()

    cy.wait("@createUser").its("request.body").should("deep.include", {
      firstName: "Chi",
      lastName: "Dev",
      email: "chi.dev@example.com",
      role: "admin",
      roleIds: ["role-admin"],
    })
    cy.contains("User added").should("be.visible")
  })

  it("validates the new-user form", () => {
    cy.dataCy("add-user").click()
    cy.dataCy("user-submit").click()
    cy.contains("First name is required").should("be.visible")
    cy.contains("Enter a valid email").should("be.visible")
    cy.contains("At least 8 characters").should("be.visible")
  })

  it("edits a user", () => {
    cy.interceptApi(
      "PATCH",
      "/users/e2e-user-0001",
      { body: ok({ id: "e2e-user-0001", firstName: "Uchechi" }) },
      "updateUser"
    )
    // Details and role assignment are two writes; the roles one lands last and
    // is what the success toast waits on.
    cy.interceptApi("PUT", "/users/e2e-user-0001/roles", { body: ok([]) }, "updateUserRoles")

    cy.contains('[data-cy="user-row"]', "Uche Tester").within(() => {
      cy.dataCy("user-edit").click()
    })
    cy.contains("Edit user").should("be.visible")
    cy.get("#email").should("be.disabled")
    cy.get("#firstName").clear().type("Uchechi")
    cy.dataCy("user-submit").click()

    cy.wait("@updateUser").its("request.body").should("deep.include", {
      firstName: "Uchechi",
      role: "user",
    })
    cy.wait("@updateUserRoles").its("request.body").should("deep.equal", { roleIds: [] })
    cy.contains("User updated").should("be.visible")
  })

  it("deactivates a user after confirmation", () => {
    cy.interceptApi("DELETE", "/users/e2e-user-0002", { body: ok(null) }, "deactivateUser")

    cy.contains('[data-cy="user-row"]', "Bola Runner").within(() => {
      cy.dataCy("user-deactivate").click()
    })
    cy.contains("Deactivate user").should("be.visible")
    cy.dataCy("confirm-ok").click()

    cy.wait("@deactivateUser")
    cy.contains("User deactivated").should("be.visible")
  })

  it("surfaces an API error when deactivation fails", () => {
    cy.interceptApi(
      "DELETE",
      "/users/e2e-user-0002",
      { statusCode: 409, body: fail("User has active test runs assigned", 409) },
      "deactivateUser"
    )

    cy.contains('[data-cy="user-row"]', "Bola Runner").within(() => {
      cy.dataCy("user-deactivate").click()
    })
    cy.dataCy("confirm-ok").click()

    cy.wait("@deactivateUser")
    // Scope to the toast — sonner also renders a hidden screen-reader copy.
    cy.get("[data-sonner-toast]").should("contain.text", "User has active test runs assigned")
  })
})

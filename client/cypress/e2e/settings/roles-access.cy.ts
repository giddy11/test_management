// cypress/e2e/settings/roles-access.cy.ts
// The Roles & access settings tab, and permission-filtered navigation.
import { apiPath, ok } from "../../support/api"

const CATEGORIES = [
  { key: "access", label: "Roles & people", description: "Who is on the team, and what they are allowed to do." },
  { key: "projects", label: "Projects", description: "The containers everything else hangs off." },
]

const PERMISSIONS = [
  { code: "role.read", category: "access", label: "View roles", description: "See roles and their permission sets.", warning: null },
  { code: "role.manage", category: "access", label: "Manage roles", description: "Create, edit and delete roles.", warning: "Can grant any permission" },
  { code: "role.assign", category: "access", label: "Assign roles", description: "Give a user a role.", warning: "Can give any user any role" },
  { code: "project.read", category: "projects", label: "View projects", description: "See projects and their details.", warning: null },
  { code: "project.export", category: "projects", label: "Export projects", description: "Download a project or suite as a spreadsheet.", warning: null },
  { code: "project.manageall", category: "projects", label: "Manage all projects", description: "Create projects, and act as team lead on every project in the organisation.", warning: "Full control of every project, including deleting it" },
]

const ROLES = [
  {
    id: "role-super", key: "super_admin", name: "Super administrator",
    description: "The platform owner.",
    isBuiltin: true, isLocked: true, permissions: ["*"], permissionCount: 1, memberCount: 1,
  },
  {
    id: "role-admin", key: "org_admin", name: "Organisation administrator",
    description: "The everyday owner of this organisation.",
    isBuiltin: true, isLocked: false,
    permissions: PERMISSIONS.map((p) => p.code),
    permissionCount: 6, memberCount: 3,
  },
  {
    id: "role-custom", key: null, name: "Release manager",
    description: "A custom role.",
    isBuiltin: false, isLocked: false,
    permissions: ["project.read"], permissionCount: 1, memberCount: 0,
  },
]

function stubAccess(roles = ROLES) {
  cy.intercept("GET", apiPath("/access/permissions"), {
    body: ok({ categories: CATEGORIES, permissions: PERMISSIONS }),
  }).as("catalog")
  cy.intercept("GET", apiPath("/access/roles"), { body: ok(roles) }).as("roles")
}

// The platform-level super-administrator role is the vendor's: the server sends
// it to a super administrator only, so this is the view an organisation
// administrator gets.
describe("Roles & access as an organisation administrator", () => {
  it("does not list the super administrator role", () => {
    cy.login("admin")
    stubAccess(ROLES.filter((r) => !r.isLocked))
    cy.visit("/settings")
    cy.dataCy("settings-tab-access").click()
    cy.wait("@roles")

    cy.dataCy("role-item-org_admin").should("exist")
    cy.dataCy("role-item-super_admin").should("not.exist")
    cy.contains("Super administrator").should("not.exist")
  })
})

describe("Roles & access", () => {
  beforeEach(() => {
    cy.login("superadmin")
    stubAccess()
    cy.visit("/settings")
    cy.dataCy("settings-tab-access").click()
    cy.wait("@roles")
    cy.wait("@catalog")
  })

  it("lists roles with permission and member counts, and locks the super role", () => {
    cy.dataCy("role-item-super_admin").should("contain.text", "Super administrator")
    // A locked role reads "All permissions", not a count.
    cy.dataCy("role-item-super_admin").should("contain.text", "All permissions · 1 member")
    cy.dataCy("role-item-super_admin").find("svg[aria-label='Locked']").should("exist")

    cy.dataCy("role-item-org_admin").should("contain.text", "6 permissions · 3 members")
    cy.dataCy("role-item-role-custom").should("contain.text", "1 permission · 0 members")

  })

  it("shows the locked role read-only with no editor", () => {
    cy.dataCy("role-item-super_admin").click()
    cy.dataCy("role-editor").should("contain.text", "locked and cannot be edited")
    cy.dataCy("save-role").should("not.exist")
    cy.dataCy("permission-role.manage").should("not.exist")
  })

  it("renders category cards with counters, codes and warnings", () => {
    cy.dataCy("role-item-org_admin").click()
    cy.dataCy("role-editor").within(() => {
      cy.contains("Built-in").should("be.visible")
      cy.contains("A built-in role. Its name is fixed").should("be.visible")

      // Category card: description + x/y counter + toggle.
      cy.contains("Roles & people").should("be.visible")
      cy.contains("Who is on the team, and what they are allowed to do.").should("be.visible")
      cy.contains("3/3").should("be.visible")

      // Raw code in monospace beneath the human label.
      cy.contains("code", "role.manage").should("be.visible")
      // Amber warning note.
      cy.contains("Can grant any permission").should("be.visible")
      cy.contains("Can give any user any role").should("be.visible")
    })
  })

  it("keeps Save disabled until something changes, then enables it", () => {
    cy.dataCy("role-item-org_admin").click()
    cy.dataCy("save-role").should("be.disabled")

    cy.dataCy("permission-project.manageall").click()
    cy.dataCy("save-role").should("not.be.disabled")

    // Putting it back makes the form clean again.
    cy.dataCy("permission-project.manageall").click()
    cy.dataCy("save-role").should("be.disabled")
  })

  it("Select all / Clear all drives the whole category", () => {
    cy.dataCy("role-item-role-custom").click()
    // Custom role starts with 1 of 3 project permissions.
    cy.contains("1/3").should("be.visible")
    cy.dataCy("toggle-category-Projects").click()
    cy.contains("3/3").should("be.visible")
    cy.dataCy("toggle-category-Projects").should("contain.text", "Clear all").click()
    cy.contains("0/3").should("be.visible")
  })

  it("offers delete only for a custom role with no members", () => {
    cy.dataCy("role-item-role-custom").click()
    cy.dataCy("delete-role").should("be.visible")
    cy.dataCy("role-item-org_admin").click()
    cy.dataCy("delete-role").should("not.exist")
  })

  it("asks for confirmation before deleting a role, and deletes only once confirmed", () => {
    cy.intercept("DELETE", apiPath("/access/roles/role-custom"), { body: ok(null) }).as("deleteRole")

    cy.dataCy("role-item-role-custom").click()
    cy.dataCy("delete-role").click()

    // Clicking Delete only opens the dialog — nothing has been sent yet.
    cy.contains("Delete role").should("be.visible")
    cy.contains('"Release manager" will be permanently deleted').should("be.visible")

    // Cancelling keeps the role and sends nothing.
    cy.dataCy("confirm-cancel").click()
    cy.dataCy("confirm-ok").should("not.exist")
    cy.dataCy("role-item-role-custom").should("exist")
    cy.get("@deleteRole.all").should("have.length", 0)

    // Confirming sends the delete.
    cy.dataCy("delete-role").click()
    cy.dataCy("confirm-ok").click()
    cy.wait("@deleteRole")
  })

  it("shows the footer notice", () => {
    cy.contains("Roles are convenience; permissions are what the server actually checks").should(
      "be.visible"
    )
    cy.contains("Hiding a control in this app is a courtesy, not a lock").should("be.visible")
  })

  it("opens the New role dialog with a clone source", () => {
    cy.dataCy("new-role").click()
    cy.dataCy("new-role-dialog").should("be.visible")
    cy.dataCy("new-role-submit").should("be.disabled")
    cy.dataCy("new-role-name").type("Release manager 2")
    cy.dataCy("new-role-submit").should("not.be.disabled")
  })
})

describe("navigation is permission-filtered", () => {
  it("shows an administrator the full sidebar", () => {
    cy.login("admin")
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.dataCy("nav-dashboard").should("exist")
    cy.dataCy("nav-projects").should("exist")
    cy.dataCy("nav-team").should("exist")
    cy.dataCy("nav-activity").should("exist")
  })

  it("hides Team, Activity and platform items from a QA engineer", () => {
    // The 'user' fixture now carries the QA engineer permission set: it has
    // project.read and dashboard.read but neither user.read nor audit.read.
    cy.login("user")
    cy.stubDashboard()
    cy.visit("/dashboard")
    cy.dataCy("nav-dashboard").should("exist")
    cy.dataCy("nav-projects").should("exist")
    cy.dataCy("nav-team").should("not.exist")
    cy.dataCy("nav-activity").should("not.exist")
    cy.dataCy("nav-platform").should("not.exist")
    cy.dataCy("nav-announcements").should("not.exist")
  })

  it("hides the Roles & access tab from someone without role.read", () => {
    cy.login("user")
    cy.visit("/settings")
    cy.dataCy("settings-tab-profile").should("exist")
    cy.dataCy("settings-tab-access").should("not.exist")
  })

  it("bounces a QA engineer away from /team", () => {
    cy.login("user")
    cy.stubDashboard()
    cy.visit("/team")
    cy.location("pathname").should("eq", "/dashboard")
  })
})

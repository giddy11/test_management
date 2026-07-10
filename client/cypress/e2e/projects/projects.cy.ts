import { fail, listMeta, ok } from "../../support/api"

describe("Projects", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", "/projects", { body: ok(projects, listMeta(projects.length, 1, 12)) }, "projects")
    })
    // The create/edit dialog fetches users for the member picker.
    cy.interceptApi("GET", "/users", { body: ok([], listMeta(0)) }, "users")
    cy.visit("/projects")
    cy.wait("@projects")
  })

  it("lists projects with suite counts", () => {
    cy.contains("h1", "Projects").should("be.visible")
    cy.contains("Apollo").should("be.visible")
    cy.contains("2 suites").should("be.visible")
    cy.contains("Hermes").should("be.visible")
    cy.contains("No suites yet").should("be.visible")
  })

  it("searches projects through the API", () => {
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi(
        "GET",
        "/projects",
        { body: ok([projects[0]], listMeta(1, 1, 12)) },
        "searchProjects"
      )
    })
    cy.dataCy("project-search").type("Apollo")
    cy.contains("Hermes").should("not.exist")
    cy.contains("Apollo").should("be.visible")
    // The search box fires one request per keystroke — the full term must
    // have reached the API in one of them.
    cy.get("@searchProjects.all").should((calls) => {
      const urls = (calls as unknown as { request: { url: string } }[]).map((c) => c.request.url)
      expect(urls.some((u) => u.includes("search=Apollo")), `saw ${urls.length} search calls`).to.be.true
    })
  })

  it("creates a project", () => {
    cy.interceptApi(
      "POST",
      "/projects",
      { body: ok({ id: "e2e-proj-new", name: "Poseidon", description: null, ownerId: "e2e-admin-0001", suiteCount: 0, createdAt: "2026-07-10T09:00:00.000Z" }) },
      "createProject"
    )

    cy.dataCy("new-project").click()
    cy.contains("New project").should("be.visible")
    cy.dataCy("project-name").type("Poseidon")
    cy.dataCy("project-description").type("Ocean telemetry")
    cy.dataCy("project-submit").click()

    cy.wait("@createProject").its("request.body").should("deep.include", {
      name: "Poseidon",
      description: "Ocean telemetry",
    })
    cy.contains("Project created").should("be.visible")
  })

  it("validates the project name before submitting", () => {
    cy.dataCy("new-project").click()
    cy.dataCy("project-submit").click()
    cy.contains("Project name is required").should("be.visible")
  })

  it("edits a project", () => {
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", "/projects/e2e-proj-1", { body: ok({ ...projects[0], members: [] }) }, "projectDetail")
      cy.interceptApi("PATCH", "/projects/e2e-proj-1", { body: ok({ ...projects[0], name: "Apollo X" }) }, "updateProject")
    })

    cy.contains('[data-cy="project-card"]', "Apollo").within(() => {
      cy.dataCy("project-edit").click()
    })
    cy.contains("Edit project").should("be.visible")
    cy.dataCy("project-name").should("have.value", "Apollo").clear().type("Apollo X")
    cy.dataCy("project-submit").click()

    cy.wait("@updateProject").its("request.body.name").should("eq", "Apollo X")
    cy.contains("Project updated").should("be.visible")
  })

  it("deletes a project after confirmation", () => {
    cy.interceptApi("DELETE", "/projects/e2e-proj-2", { body: ok(null) }, "deleteProject")

    cy.contains('[data-cy="project-card"]', "Hermes").within(() => {
      cy.dataCy("project-delete").click()
    })
    cy.contains("Delete project").should("be.visible")
    cy.contains('"Hermes"').should("be.visible")
    cy.dataCy("confirm-ok").click()

    cy.wait("@deleteProject")
    cy.contains("Project deleted").should("be.visible")
  })

  it("surfaces an API error when deletion fails", () => {
    cy.interceptApi(
      "DELETE",
      "/projects/e2e-proj-2",
      { statusCode: 403, body: fail("You do not have permission to delete this project", 403) },
      "deleteProject"
    )

    cy.contains('[data-cy="project-card"]', "Hermes").within(() => {
      cy.dataCy("project-delete").click()
    })
    cy.dataCy("confirm-ok").click()

    cy.wait("@deleteProject")
    // Scope to the toast — sonner also renders a hidden screen-reader copy.
    cy.get("[data-sonner-toast]").should("contain.text", "You do not have permission to delete this project")
  })

  it("hides management actions from regular users", () => {
    cy.login("user")
    cy.visit("/projects")
    cy.wait("@projects")

    cy.dataCy("new-project").should("not.exist")
    cy.dataCy("project-edit").should("not.exist")
    cy.dataCy("project-delete").should("not.exist")
  })
})

// Regenerates the documentation screenshots in src/assets/docs/ from stubbed
// pages. Lives outside cypress/e2e so the normal suite never runs it.
//
// To re-capture (e.g. after a UI change):
//   1. npm run dev:e2e          (in one terminal)
//   2. npx cypress run --headed --config specPattern="cypress/capture/**" --spec cypress/capture/docs-screenshots.cy.ts
//      (--headed matters: chart animations never finish headless, leaving empty charts)
//   3. cp cypress/screenshots/docs-screenshots.cy.ts/*.png src/assets/docs/
//
// The docs use dashboard.png for both the Introduction and Dashboard sections.
import { listMeta, ok } from "../support/api"

const PROJECT_ID = "e2e-proj-1"
const SUITE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
const CASE_ID = "e2e-case-1"
const RUN_ID = "e2e-run-1"
const BUG_ID = "e2e-bug-1"
const FR_ID = "e2e-fr-1"
const TOKEN = "e2e-feedback-token"

// Force the light theme before the app boots.
const lightTheme = {
  onBeforeLoad(win: Window) {
    win.localStorage.setItem("tm_theme", "light")
  },
}

function shoot(name: string, settleMs = 500) {
  // Hide scrollbars so they don't appear in the captures.
  cy.document().then((doc) => {
    const style = doc.createElement("style")
    style.innerHTML =
      "::-webkit-scrollbar{display:none !important} html{scrollbar-width:none}"
    doc.head.appendChild(style)
  })
  // Give fonts/layout/chart animations a beat to settle before capturing.
  cy.wait(settleMs)
  cy.screenshot(name, { capture: "viewport", overwrite: true })
}

function stubProject() {
  cy.fixture("projects/list").then((projects) => {
    cy.interceptApi(
      "GET",
      `/projects/${PROJECT_ID}`,
      {
        body: ok({
          ...projects[0],
          members: [
            { id: "e2e-user-0001", name: "Uche Tester", email: "uche.tester@example.com", role: "team_lead" },
            { id: "e2e-user-0002", name: "Bola Runner", email: "bola.runner@example.com", role: "member" },
          ],
        }),
      },
      "project"
    )
  })
}

describe("Docs screenshot capture", () => {
  it("registration page", () => {
    cy.visit("/register", lightTheme)
    cy.contains("Create your organisation").should("be.visible")
    shoot("getting-started")
  })

  it("dashboard (admin) — also used for the introduction section", () => {
    cy.login("admin")
    cy.stubDashboard()
    cy.fixture("dashboard/overview").then((overview) => {
      cy.interceptApi("GET", "/dashboard/overview", { body: ok(overview) }, "overview")
    })
    cy.visit("/dashboard", lightTheme)
    cy.contains("Welcome back").should("be.visible")
    cy.dataCy("page-loader").should("not.exist")
    shoot("dashboard", 2000) // charts animate in
  })

  it("project detail with tabs", () => {
    cy.login("admin")
    stubProject()
    cy.fixture("testmgmt/suites").then((suites) => {
      cy.interceptApi("GET", "/test-suites", { body: ok(suites, listMeta(suites.length)) }, "suites")
    })
    cy.visit(`/projects/${PROJECT_ID}`, lightTheme)
    cy.contains("h1", "Apollo").should("be.visible")
    cy.dataCy("suite-card").should("have.length.at.least", 1)
    shoot("projects")
  })

  it("test case detail", () => {
    cy.login("user")
    stubProject()
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi("GET", `/test-cases/${CASE_ID}`, { body: ok(cases[0]) }, "case")
    })
    cy.interceptApi("GET", `/test-cases/${CASE_ID}/attachments`, { body: ok([]) }, "attachments")
    cy.visit(`/projects/${PROJECT_ID}/suites/${SUITE_ID}/cases/${CASE_ID}`, lightTheme)
    cy.contains("h1", "Valid login").should("be.visible")
    shoot("suites-and-cases")
  })

  it("run execution", () => {
    cy.login("admin")
    stubProject()
    cy.fixture("testmgmt/run").then((run) => {
      cy.interceptApi("GET", `/test-runs/${RUN_ID}`, { body: ok(run) }, "run")
    })
    cy.fixture("testmgmt/results").then((results) => {
      cy.interceptApi("GET", "/test-run-results", { body: ok(results, listMeta(results.length)) }, "results")
    })
    cy.visit(`/projects/${PROJECT_ID}/runs/${RUN_ID}`, lightTheme)
    cy.contains("h1", "Release 1.4 run").should("be.visible")
    shoot("test-runs")
  })

  it("bug detail", () => {
    cy.login("admin")
    stubProject()
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("GET", `/bugs/${BUG_ID}`, { body: ok(bugs[0]) }, "bug")
    })
    cy.interceptApi("GET", `/bugs/${BUG_ID}/attachments`, { body: ok([]) }, "attachments")
    cy.fixture("team/users").then((users) => {
      cy.interceptApi("GET", "/users", { body: ok(users, listMeta(users.length)) }, "users")
    })
    cy.visit(`/projects/${PROJECT_ID}/bugs/${BUG_ID}`, lightTheme)
    cy.contains("h1", "Login button unresponsive on Safari").should("be.visible")
    shoot("bugs")
  })

  it("feature request detail", () => {
    cy.login("admin")
    stubProject()
    cy.fixture("featureRequests/list").then((requests) => {
      cy.interceptApi("GET", `/feature-requests/${FR_ID}`, { body: ok(requests[0]) }, "request")
    })
    cy.interceptApi("GET", `/feature-requests/${FR_ID}/attachments`, { body: ok([]) }, "attachments")
    cy.visit(`/projects/${PROJECT_ID}/feature-requests/${FR_ID}`, lightTheme)
    cy.contains("h1", "Dark mode for reports").should("be.visible")
    shoot("feature-requests")
  })

  it("public feedback form", () => {
    cy.interceptApi(
      "GET",
      `/public/feedback/${TOKEN}`,
      {
        body: ok({
          projectName: "Apollo",
          suites: [
            { id: "s1", name: "Authentication" },
            { id: "s2", name: "Checkout" },
          ],
        }),
      },
      "form"
    )
    cy.visit(`/feedback/${TOKEN}`, lightTheme)
    cy.contains("Apollo — feedback").should("be.visible")
    shoot("feedback-portal")
  })

  it("team page", () => {
    cy.login("admin")
    cy.fixture("team/users").then((users) => {
      cy.interceptApi("GET", "/users", { body: ok(users, listMeta(users.length)) }, "users")
    })
    cy.visit("/team", lightTheme)
    cy.contains("h1", "Team").should("be.visible")
    cy.dataCy("page-loader").should("not.exist")
    shoot("team")
  })

  it("what's new dialog", () => {
    cy.login("user")
    cy.stubDashboard()
    // Later intercepts win — override stubLayout's empty unseen list.
    cy.interceptApi(
      "GET",
      "/app-updates/unseen",
      {
        body: ok([
          {
            id: "e2e-update-1",
            title: "Test run exports",
            body: "Suites and projects can now be exported to Excel, including results and assignees.",
            createdAt: "2026-07-10T09:00:00.000Z",
          },
          {
            id: "e2e-update-2",
            title: "Public feedback portal",
            body: "Share a link with external users and track their feedback through to resolution.",
            createdAt: "2026-07-08T09:00:00.000Z",
          },
        ]),
      },
      "appUpdates"
    )
    cy.visit("/dashboard", lightTheme)
    cy.contains("Test run exports").should("be.visible")
    shoot("announcements")
  })

  it("activity log", () => {
    cy.login("admin")
    cy.interceptApi("GET", "/users", { body: ok([], listMeta(0)) }, "users")
    cy.interceptApi(
      "GET",
      "/activity",
      {
        body: ok(
          [
            {
              id: "e2e-act-1",
              entityType: "project",
              action: "project.created",
              summary: "Ada Admin created project Apollo",
              actor: { id: "e2e-admin-0001", name: "Ada Admin" },
              data: { projectId: PROJECT_ID },
              createdAt: "2026-07-10T08:00:00.000Z",
            },
            {
              id: "e2e-act-2",
              entityType: "testRun",
              action: "run.completed",
              summary: "Uche Tester completed run Release 1.4",
              actor: { id: "e2e-user-0001", name: "Uche Tester" },
              data: { runId: RUN_ID },
              createdAt: "2026-07-10T11:30:00.000Z",
            },
            {
              id: "e2e-act-3",
              entityType: "bug",
              action: "bug.reported",
              summary: "Bola Runner reported bug Login button unresponsive on Safari",
              actor: { id: "e2e-user-0002", name: "Bola Runner" },
              data: { bugId: BUG_ID },
              createdAt: "2026-07-11T09:15:00.000Z",
            },
          ],
          listMeta(3)
        ),
      },
      "activity"
    )
    cy.visit("/activity", lightTheme)
    cy.contains("h1", "Activity log").should("be.visible")
    shoot("activity")
  })

  it("settings page", () => {
    cy.login("user")
    cy.visit("/settings", lightTheme)
    cy.dataCy("settings-tab-profile").should("be.visible")
    shoot("settings")
  })

  it("roles — sidebar with role preview menu open", () => {
    cy.login("admin")
    cy.stubDashboard()
    cy.visit("/dashboard", lightTheme)
    cy.contains("Welcome back").should("be.visible")
    cy.dataCy("user-menu").click()
    cy.contains("Preview as").should("be.visible")
    shoot("roles")
  })
})

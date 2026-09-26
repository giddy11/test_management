import { listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"

// Stubs shared by every test on this page.
function stubProjectDetail() {
  cy.fixture("projects/list").then((projects) => {
    cy.interceptApi(
      "GET",
      `/projects/${PROJECT_ID}`,
      { body: ok({ ...projects[0], members: [{ id: "e2e-user-0001", name: "Uche Tester", email: "uche.tester@example.com", role: "team_lead" }] }) },
      "project"
    )
  })
  cy.fixture("dashboard/overview").then((overview) => {
    cy.interceptApi("GET", "/dashboard/overview", { body: ok(overview) }, "overview")
  })
  cy.fixture("testmgmt/suites").then((suites) => {
    cy.interceptApi("GET", "/test-suites", { body: ok(suites, listMeta(suites.length)) }, "suites")
  })
}

describe("Project detail — suites", () => {
  beforeEach(() => {
    cy.login("admin")
    stubProjectDetail()
    cy.visit(`/projects/${PROJECT_ID}`)
    cy.wait(["@project", "@suites"])
  })

  it("shows the project header, members, and suite cards", () => {
    cy.contains("h1", "Apollo").should("be.visible")
    cy.contains("Uche Tester").should("be.visible")
    cy.contains("· Lead").should("be.visible")
    cy.dataCy("suite-card").should("have.length", 2)
    cy.contains('[data-cy="suite-card"]', "Authentication").should("contain", "2 test cases")
    cy.contains('[data-cy="suite-card"]', "Checkout").should("contain", "No test cases yet")
  })

  it("searches suites by name through the API", () => {
    cy.interceptApi("GET", "/test-suites", { body: ok([], listMeta(0)) }, "searchedSuites")

    cy.dataCy("suite-search").type("Pay")

    cy.wait("@searchedSuites").its("request.url").should("include", "search=Pay")
    cy.contains("No suites match “Pay”.").should("be.visible")
  })

  it("creates a suite", () => {
    cy.fixture("testmgmt/suites").then((suites) => {
      cy.interceptApi(
        "POST",
        "/test-suites",
        { body: ok({ ...suites[0], id: "3f2504e0-4f89-41d3-9a0c-0305e82c3303", name: "Payments" }) },
        "createSuite"
      )
    })

    cy.dataCy("new-suite").click()
    cy.contains("New test suite").should("be.visible")
    cy.dataCy("suite-name").type("Payments")
    cy.dataCy("suite-description").type("Card and transfer flows")
    cy.dataCy("suite-submit").click()

    cy.wait("@createSuite").its("request.body").should("deep.include", {
      name: "Payments",
      description: "Card and transfer flows",
      projectId: PROJECT_ID,
    })
    cy.contains("Suite created").should("be.visible")
  })

  it("validates the suite name", () => {
    cy.dataCy("new-suite").click()
    cy.dataCy("suite-submit").click()
    cy.contains("Suite name is required").should("be.visible")
  })

  it("deletes a suite after confirmation", () => {
    cy.interceptApi(
      "DELETE",
      "/test-suites/3f2504e0-4f89-41d3-9a0c-0305e82c3302",
      { body: ok(null) },
      "deleteSuite"
    )

    cy.contains('[data-cy="suite-card"]', "Checkout").within(() => {
      cy.dataCy("suite-delete").click()
    })
    cy.contains("Delete suite").should("be.visible")
    cy.dataCy("confirm-ok").click()

    cy.wait("@deleteSuite")
    cy.contains("Suite deleted").should("be.visible")
  })

  it("opens a suite's detail page", () => {
    cy.fixture("testmgmt/suites").then((suites) => {
      cy.interceptApi("GET", `/test-suites/${suites[0].id}`, { body: ok(suites[0]) }, "suite")
    })
    cy.fixture("testmgmt/cases").then((cases) => {
      cy.interceptApi("GET", "/test-cases", { body: ok(cases, listMeta(cases.length)) }, "cases")
    })

    cy.contains('[data-cy="suite-card"]', "Authentication").click()
    cy.location("pathname").should("include", "/suites/3f2504e0-4f89-41d3-9a0c-0305e82c3301")
    cy.contains("h1", "Authentication").should("be.visible")
  })
})

describe("Project detail — runs tab", () => {
  beforeEach(() => {
    cy.login("admin")
    stubProjectDetail()
    cy.fixture("testmgmt/run").then((run) => {
      cy.interceptApi("GET", "/test-runs", { body: ok([run], listMeta(1)) }, "runs")
    })
    cy.interceptApi("GET", "/test-runs/active-status", { body: ok({ activeSuiteIds: [] }) }, "activeStatus")
    cy.visit(`/projects/${PROJECT_ID}?tab=runs`)
    cy.wait("@runs")
  })

  it("lists runs with status and suite name", () => {
    cy.dataCy("run-card").should("have.length", 1)
    cy.contains('[data-cy="run-card"]', "Release 1.4 run").within(() => {
      cy.contains("In progress").should("be.visible")
      cy.contains("Authentication").should("be.visible")
      cy.contains("Ada Admin").should("be.visible")
    })
  })

  it("starts a run and lands on the run detail page", () => {
    cy.fixture("testmgmt/run").then((run) => {
      cy.interceptApi("POST", "/test-runs", { body: ok({ ...run, id: "e2e-run-2", name: "Smoke run" }) }, "createRun")
      cy.interceptApi("GET", "/test-runs/e2e-run-2", { body: ok({ ...run, id: "e2e-run-2", name: "Smoke run" }) }, "runDetail")
    })
    cy.fixture("testmgmt/results").then((results) => {
      cy.interceptApi("GET", "/test-run-results", { body: ok(results, listMeta(results.length)) }, "results")
    })

    cy.dataCy("start-run").click()
    cy.contains("Start a test run").should("be.visible")
    cy.dataCy("run-name").clear().type("Smoke run")
    cy.selectDropdown('[data-cy="run-suite"]', "Authentication")
    cy.dataCy("run-submit").click()

    cy.wait("@createRun").its("request.body").should("deep.equal", {
      name: "Smoke run",
      projectId: PROJECT_ID,
      suiteId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    })
    cy.location("pathname").should("eq", `/projects/${PROJECT_ID}/runs/e2e-run-2`)
    cy.contains("h1", "Smoke run").should("be.visible")
  })
})

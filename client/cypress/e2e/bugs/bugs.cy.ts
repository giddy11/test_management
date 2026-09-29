import { listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"

describe("Bug reports", () => {
  beforeEach(() => {
    cy.login("user")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.fixture("dashboard/overview").then((overview) => {
      cy.interceptApi("GET", "/dashboard/overview", { body: ok(overview) }, "overview")
    })
    cy.fixture("testmgmt/suites").then((suites) => {
      cy.interceptApi("GET", "/test-suites", { body: ok(suites, listMeta(suites.length)) }, "suites")
    })
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("GET", "/bugs", { body: ok(bugs, listMeta(bugs.length)) }, "bugs")
    })
    cy.visit(`/projects/${PROJECT_ID}?tab=bugs`)
    // The tab-count query hits /bugs as well and answers first, so @bugs alone
    // doesn't mean the list has loaded. Wait for a rendered row — until then a
    // test's own /bugs intercept can catch the unfiltered list request.
    cy.wait("@bugs")
    cy.dataCy("bug-card").should("have.length", 1)
  })

  it("lists bugs with severity and status", () => {
    cy.dataCy("bug-card").should("have.length", 1)
    cy.dataCy("bugs-tab-count").should("have.text", "1")
    cy.contains('[data-cy="bug-card"]', "Login button unresponsive on Safari").within(() => {
      cy.contains("Open").should("be.visible")
      cy.contains("Major").should("be.visible")
    })
  })

  it("filters bugs by status through the API", () => {
    cy.interceptApi("GET", "/bugs", { body: ok([], listMeta(0)) }, "filteredBugs")

    cy.contains("All statuses").click()
    cy.contains('[role="option"]', "Fixed").click()

    cy.wait("@filteredBugs").its("request.url").should("include", "status=Fixed")
    cy.contains("No bugs reported yet.").should("be.visible")
  })

  it("searches bugs by reporter, suite and assignee through the API", () => {
    cy.interceptApi("GET", "/bugs", { body: ok([], listMeta(0)) }, "searchedBugs")

    cy.selectDropdown('[data-cy="search-by"]', "Reporter")
    cy.get('input[placeholder="Search by reporter name…"]').type("Uche").should("have.value", "Uche")
    cy.wait("@searchedBugs").its("request.url").should("include", "searchBy=reporter").and("include", "search=Uche")

    cy.selectDropdown('[data-cy="search-by"]', "Suite")
    cy.wait("@searchedBugs").its("request.url").should("include", "searchBy=suite").and("include", "search=Uche")

    cy.selectDropdown('[data-cy="search-by"]', "Assigned to")
    cy.wait("@searchedBugs").its("request.url").should("include", "searchBy=assignee").and("include", "search=Uche")
  })

  it("filters bugs by report date range through the API", () => {
    cy.interceptApi("GET", "/bugs", { body: ok([], listMeta(0)) }, "datedBugs")

    cy.dataCy("date-from").type("2026-07-01")
    cy.wait("@datedBugs").its("request.url").should("include", "from=2026-07-01").and("not.include", "to=")

    cy.dataCy("date-to").type("2026-07-31")
    cy.wait("@datedBugs").its("request.url").should("include", "from=2026-07-01").and("include", "to=2026-07-31")

    // Clearing goes back to the unfiltered query, which is still cached and
    // fresh (staleTime 1m), so it is served without another request. Assert the
    // restored list rather than a fetch that never happens.
    cy.dataCy("date-clear").click()
    cy.dataCy("date-from").should("have.value", "")
    cy.dataCy("date-to").should("have.value", "")
    cy.dataCy("bug-card").should("have.length", 1)
  })

  it("clears all filters at once", () => {
    cy.interceptApi("GET", "/bugs", { body: ok([], listMeta(0)) }, "filteredBugs")
    cy.dataCy("clear-filters").should("not.exist")

    cy.contains("All statuses").click()
    cy.contains('[role="option"]', "Fixed").click()
    cy.wait("@filteredBugs")

    cy.selectDropdown('[data-cy="search-by"]', "Reporter")
    cy.get('input[placeholder="Search by reporter name…"]').type("Uche")
    cy.wait("@filteredBugs")

    cy.dataCy("date-from").type("2026-07-01")
    cy.wait("@filteredBugs")

    // Clearing goes back to the unfiltered query, which is still cached and
    // fresh (staleTime 1m), so it is served without another request.
    cy.dataCy("clear-filters").click()

    cy.contains("All statuses").should("be.visible")
    cy.contains("Search by title…").should("be.visible")
    cy.get('input[placeholder="Search by reporter name…"]').should("not.exist")
    cy.dataCy("date-from").should("have.value", "")
    cy.dataCy("date-to").should("have.value", "")
    cy.dataCy("clear-filters").should("not.exist")
    cy.dataCy("bug-card").should("have.length", 1)
  })

  it("reports a bug", () => {
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("POST", "/bugs", { body: ok({ ...bugs[0], id: "e2e-bug-new" }) }, "createBug")
    })

    cy.dataCy("report-bug").click()
    cy.contains("Report a bug").should("be.visible")
    cy.get("#title").type("Export hangs on large suites")
    cy.get("#description").type("Exporting a suite with 500+ cases never finishes.")
    cy.get("#stepsToReproduceText").type("Open a large suite{enter}Click export")
    cy.dataCy("bug-submit").click()

    cy.wait("@createBug").its("request.body").should("deep.include", {
      projectId: PROJECT_ID,
      title: "Export hangs on large suites",
      stepsToReproduce: ["Open a large suite", "Click export"],
    })
    cy.contains("Bug reported").should("be.visible")
  })

  it("validates required fields on the bug form", () => {
    cy.dataCy("report-bug").click()
    cy.dataCy("bug-submit").click()
    cy.contains("Title is required").should("be.visible")
    cy.contains("Description is required").should("be.visible")
  })
})

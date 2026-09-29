import { listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"

describe("Feature requests", () => {
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
    cy.fixture("featureRequests/list").then((requests) => {
      cy.interceptApi("GET", "/feature-requests", { body: ok(requests, listMeta(requests.length)) }, "featureRequests")
    })
    cy.visit(`/projects/${PROJECT_ID}?tab=feature-requests`)
    // The tab-count query hits /feature-requests as well and answers first, so
    // @featureRequests alone doesn't mean the list has loaded. Wait for a
    // rendered card — until then a test's own intercept can catch the
    // unfiltered list request.
    cy.wait("@featureRequests")
    cy.dataCy("feature-request-card").should("have.length", 2)
  })

  it("lists requests with status, votes, and comment counts", () => {
    cy.dataCy("feature-request-card").should("have.length", 2)
    cy.dataCy("feature-requests-tab-count").should("have.text", "2")
    cy.contains('[data-cy="feature-request-card"]', "Dark mode for reports").within(() => {
      cy.contains("Under Review").should("be.visible")
      cy.contains("UI/UX").should("be.visible")
      cy.contains("4").should("be.visible")
      cy.contains("Uche Tester").should("be.visible")
    })
    cy.contains('[data-cy="feature-request-card"]', "Bulk import from TestRail").within(() => {
      cy.contains("Planned").should("be.visible")
    })
  })

  it("searches requests by reporter through the API", () => {
    cy.interceptApi("GET", "/feature-requests", { body: ok([], listMeta(0)) }, "searchedRequests")

    cy.selectDropdown('[data-cy="search-by"]', "Reporter")
    cy.get('input[placeholder="Search by reporter name…"]').type("Uche").should("have.value", "Uche")

    cy.wait("@searchedRequests").its("request.url").should("include", "searchBy=reporter").and("include", "search=Uche")
  })

  it("filters requests by submission date range through the API", () => {
    cy.interceptApi("GET", "/feature-requests", { body: ok([], listMeta(0)) }, "datedRequests")

    cy.dataCy("date-from").type("2026-07-01")
    cy.wait("@datedRequests").its("request.url").should("include", "from=2026-07-01").and("not.include", "to=")

    cy.dataCy("date-to").type("2026-07-31")
    cy.wait("@datedRequests").its("request.url").should("include", "from=2026-07-01").and("include", "to=2026-07-31")

    // Clearing goes back to the unfiltered query, which is still cached and
    // fresh (staleTime 1m), so it is served without another request. Assert the
    // restored list rather than a fetch that never happens.
    cy.dataCy("date-clear").click()
    cy.dataCy("date-from").should("have.value", "")
    cy.dataCy("date-to").should("have.value", "")
    cy.dataCy("feature-request-card").should("have.length", 2)
  })

  it("clears all filters at once, leaving sort untouched", () => {
    cy.interceptApi("GET", "/feature-requests", { body: ok([], listMeta(0)) }, "filteredRequests")
    cy.dataCy("clear-filters").should("not.exist")

    cy.contains("All statuses").click()
    cy.contains('[role="option"]', "Planned").click()
    cy.wait("@filteredRequests")

    cy.contains("Top").click()
    cy.contains('[role="option"]', "Newest").click()

    cy.selectDropdown('[data-cy="search-by"]', "Reporter")
    cy.get('input[placeholder="Search by reporter name…"]').type("Uche")
    cy.wait("@filteredRequests")

    cy.dataCy("date-from").type("2026-07-01")
    cy.wait("@filteredRequests")

    // Clearing goes back to the unfiltered query, which is still cached and
    // fresh (staleTime 1m), so it is served without another request.
    cy.dataCy("clear-filters").click()

    cy.contains("All statuses").should("be.visible")
    cy.contains("Search by title…").should("be.visible")
    cy.get('input[placeholder="Search by reporter name…"]').should("not.exist")
    cy.dataCy("date-from").should("have.value", "")
    cy.dataCy("date-to").should("have.value", "")
    cy.dataCy("clear-filters").should("not.exist")
    // Sort isn't a filter — clearing leaves the earlier "Newest" choice as is.
    cy.contains("Newest").should("be.visible")
    cy.dataCy("feature-request-card").should("have.length", 2)
  })

  it("upvotes a request", () => {
    cy.interceptApi(
      "POST",
      "/feature-requests/e2e-fr-1/vote",
      { body: ok({ voted: true, upvoteCount: 5 }) },
      "vote"
    )

    cy.contains('[data-cy="feature-request-card"]', "Dark mode for reports").within(() => {
      cy.dataCy("vote-button").click()
    })
    cy.wait("@vote")
  })

  it("submits a new feature request", () => {
    cy.fixture("featureRequests/list").then((requests) => {
      cy.interceptApi("POST", "/feature-requests", { body: ok({ ...requests[0], id: "e2e-fr-new" }) }, "createRequest")
    })

    cy.dataCy("new-feature-request").click()
    cy.contains("Suggest a feature").should("be.visible")
    cy.get("#title").type("Slack notifications")
    cy.get("#description").type("Send run summaries to a Slack channel.")
    cy.get("#category").type("Integration")
    cy.dataCy("feature-request-submit").click()

    cy.wait("@createRequest").its("request.body").should("deep.include", {
      projectId: PROJECT_ID,
      title: "Slack notifications",
      description: "Send run summaries to a Slack channel.",
      category: "Integration",
    })
    cy.contains("Feature request submitted").should("be.visible")
  })

  it("validates required fields on the request form", () => {
    cy.dataCy("new-feature-request").click()
    cy.dataCy("feature-request-submit").click()
    cy.contains("Title is required").should("be.visible")
    cy.contains("Description is required").should("be.visible")
  })

  it("opens a request's detail page", () => {
    cy.fixture("featureRequests/list").then((requests) => {
      cy.interceptApi("GET", "/feature-requests/e2e-fr-1", { body: ok(requests[0]) }, "requestDetail")
      cy.interceptApi("GET", "/feature-requests/e2e-fr-1/attachments", { body: ok([]) }, "attachments")
      // Comments are realtime Firestore — with the e2e placeholder config the
      // hook lands in its handled error state; nothing to stub.
    })

    cy.contains('[data-cy="feature-request-card"]', "Dark mode for reports").click()
    cy.location("pathname").should("eq", `/projects/${PROJECT_ID}/feature-requests/e2e-fr-1`)
    cy.contains("Dark mode for reports").should("be.visible")
  })
})

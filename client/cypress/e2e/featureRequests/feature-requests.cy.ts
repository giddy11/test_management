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
    cy.wait("@featureRequests")
  })

  it("lists requests with status, votes, and comment counts", () => {
    cy.dataCy("feature-request-card").should("have.length", 2)
    cy.contains('[data-cy="feature-request-card"]', "Dark mode for reports").within(() => {
      cy.contains("Under Review").should("be.visible")
      cy.contains("UI/UX").should("be.visible")
      cy.contains("4").should("be.visible")
      cy.contains("by Uche Tester").should("be.visible")
    })
    cy.contains('[data-cy="feature-request-card"]', "Bulk import from TestRail").within(() => {
      cy.contains("Planned").should("be.visible")
    })
  })

  it("searches requests by reporter through the API", () => {
    cy.interceptApi("GET", "/feature-requests", { body: ok([], listMeta(0)) }, "searchedRequests")

    cy.dataCy("search-by").click()
    cy.contains('[role="option"]', "Reporter").click()
    cy.get('input[placeholder="Search by reporter name…"]').type("Uche")

    cy.wait("@searchedRequests").its("request.url").should("include", "searchBy=reporter").and("include", "search=Uche")
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

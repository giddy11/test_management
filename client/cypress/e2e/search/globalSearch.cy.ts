import { apiPath, ok } from "../../support/api"

// One result of each type the API can return, so the panel is exercised the way
// a real search across a populated workspace would be.
const RESULTS = [
  {
    type: "project",
    id: "proj-1",
    title: "Checkout Revamp",
    reference: null,
    projectId: "proj-1",
    projectName: "Checkout Revamp",
    suiteId: null,
    context: null,
    createdAt: "2026-07-28T09:00:00.000Z",
  },
  {
    type: "suite",
    id: "suite-1",
    title: "Checkout — payment",
    reference: null,
    projectId: "proj-1",
    projectName: "Checkout Revamp",
    suiteId: "suite-1",
    context: null,
    createdAt: "2026-07-28T09:00:00.000Z",
  },
  {
    type: "case",
    id: "case-1",
    title: "Checkout with an expired card",
    reference: "JIRA-77",
    projectId: "proj-1",
    projectName: "Checkout Revamp",
    suiteId: "suite-1",
    context: "Checkout — payment",
    createdAt: "2026-07-28T09:00:00.000Z",
  },
  {
    type: "run",
    id: "run-1",
    title: "Checkout regression — July",
    reference: null,
    projectId: "proj-1",
    projectName: "Checkout Revamp",
    suiteId: "suite-1",
    context: "Checkout — payment",
    createdAt: "2026-07-28T09:00:00.000Z",
  },
  {
    type: "bug",
    id: "bug-1",
    title: "Checkout total is wrong",
    reference: "BF-20260728-014",
    projectId: "proj-1",
    projectName: "Checkout Revamp",
    suiteId: null,
    context: "Open",
    createdAt: "2026-07-28T09:00:00.000Z",
  },
  {
    type: "ticket",
    id: "ticket-1",
    title: "Checkout page will not load",
    reference: "TKT-20260728-042",
    projectId: "proj-1",
    projectName: "Checkout Revamp",
    suiteId: null,
    context: "bug",
    createdAt: "2026-07-28T09:00:00.000Z",
  },
]

// The stub answers on the term, the way the real endpoint does — so a spec can
// type something that matches nothing and get the empty state honestly.
function stubSearch() {
  cy.intercept("GET", apiPath("/search"), (req) => {
    const q = (req.query.q as string) ?? ""
    const hits = RESULTS.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()))
    req.reply({ body: ok(hits) })
  }).as("search")
}

describe("Global search", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.stubDashboard()
    stubSearch()
    cy.visit("/dashboard")
    cy.wait("@overview")
  })

  it("returns every record type, each labelled and identifiable", () => {
    cy.dataCy("global-search-input").type("checkout")
    cy.wait("@search")

    cy.dataCy("global-search-result").should("have.length", RESULTS.length)
    cy.dataCy("global-search-results").within(() => {
      cy.contains("Project").should("be.visible")
      cy.contains("Test Suite").should("be.visible")
      cy.contains("Test Case").should("be.visible")
      cy.contains("Test Run").should("be.visible")
      cy.contains("Bug").should("be.visible")
      cy.contains("Ticket").should("be.visible")
      // A reference code and the owning project are what tell two similarly
      // titled records apart at a glance.
      cy.contains("BF-20260728-014").should("be.visible")
      cy.contains("Checkout Revamp").should("be.visible")
    })
  })

  it("searches on a partial keyword", () => {
    cy.dataCy("global-search-input").type("check")
    cy.wait("@search").its("request.query.q").should("eq", "check")
    cy.dataCy("global-search-result").should("have.length.greaterThan", 0)
  })

  it("does not search until the term is long enough", () => {
    cy.dataCy("global-search-input").type("c")
    cy.contains("Keep typing").should("be.visible")
    cy.dataCy("global-search-result").should("not.exist")
  })

  it("says so when nothing matches", () => {
    cy.dataCy("global-search-input").type("zzzznothing")
    cy.wait("@search")
    cy.dataCy("global-search-empty").should("contain", "No results found")
  })

  it("opens a test case at its own page", () => {
    cy.dataCy("global-search-input").type("expired card")
    cy.wait("@search")
    cy.contains('[data-cy="global-search-result"]', "expired card").click()
    cy.location("pathname").should("eq", "/projects/proj-1/suites/suite-1/cases/case-1")
  })

  it("opens a bug at its own page", () => {
    cy.dataCy("global-search-input").type("total is wrong")
    cy.wait("@search")
    cy.contains('[data-cy="global-search-result"]', "total is wrong").click()
    cy.location("pathname").should("eq", "/projects/proj-1/bugs/bug-1")
  })

  it("opens a ticket in the triage list, deep-linked by its code", () => {
    cy.interceptApi("GET", "/feedback", { body: ok([]) }, "feedback")
    cy.dataCy("global-search-input").type("will not load")
    cy.wait("@search")
    cy.contains('[data-cy="global-search-result"]', "will not load").click()
    cy.location("pathname").should("eq", "/all-feedback")
    cy.location("search").should("contain", "TKT-20260728-042")
  })

  it("selects a result with the keyboard", () => {
    cy.dataCy("global-search-input").type("checkout")
    cy.wait("@search")
    // First result is already active, so one ArrowDown lands on the suite.
    cy.dataCy("global-search-input").type("{downarrow}{enter}")
    cy.location("pathname").should("eq", "/projects/proj-1/suites/suite-1")
  })

  it("clears the input and starts again without a reload", () => {
    cy.dataCy("global-search-input").type("checkout")
    cy.wait("@search")
    cy.dataCy("global-search-result").should("exist")

    cy.dataCy("global-search-clear").click()
    cy.dataCy("global-search-input").should("have.value", "")
    cy.dataCy("global-search-results").should("not.exist")
    cy.location("pathname").should("eq", "/dashboard")

    cy.dataCy("global-search-input").type("expired card")
    cy.wait("@search")
    cy.dataCy("global-search-result").should("have.length", 1)
  })

  it("closes the panel on Escape without losing what was typed", () => {
    cy.dataCy("global-search-input").type("checkout")
    cy.wait("@search")
    cy.dataCy("global-search-input").type("{esc}")
    cy.dataCy("global-search-results").should("not.exist")
    cy.dataCy("global-search-input").should("have.value", "checkout")
  })
})

describe("Global search — accounts with no project surface", () => {
  it("is not offered to an account without project.read", () => {
    cy.login("admin", { permissions: ["supportqueue.read", "sla.read"] })
    cy.visit("/settings")
    cy.dataCy("global-search-input").should("not.exist")
  })
})

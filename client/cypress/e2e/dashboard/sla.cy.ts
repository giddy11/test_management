import { apiPath, ok } from "../../support/api"

describe("Dashboard — SLA & support tab", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.stubDashboard()
    cy.stubSla()
    cy.visit("/dashboard?tab=sla")
    cy.wait("@slaOverview")
  })

  it("opens straight onto the SLA tab from the URL and shows the KPI cards", () => {
    cy.dataCy("dashboard-tab-sla").should("have.attr", "data-state", "active")
    cy.dataCy("sla-kpi-total").should("contain", "12").and("contain", "7 bugs").and("contain", "4 features")
    cy.dataCy("sla-kpi-resolved").should("contain", "8")
    cy.dataCy("sla-kpi-open").should("contain", "4")
    cy.dataCy("sla-kpi-awaiting").should("contain", "2")
    cy.dataCy("sla-kpi-first-response").should("contain", "1h 30m").and("contain", "72.7%")
    cy.dataCy("sla-kpi-resolution").should("contain", "2d").and("contain", "75%")
    cy.dataCy("sla-kpi-compliance").should("contain", "66.7%")
    cy.dataCy("sla-kpi-breached").should("contain", "3")
  })

  it("renders the breakdown sections", () => {
    cy.contains("Tickets, bugs & feature requests over time").should("be.visible")
    cy.contains("Issues by source").should("be.visible")
    cy.contains("Issues by severity").should("be.visible")
    cy.contains("Issues by status").should("be.visible")
    cy.contains("Most recurring issues").should("be.visible")
    cy.contains("Export button does nothing").should("be.visible")
    cy.contains("By team member").should("be.visible")
    cy.contains("Uche Tester").should("be.visible")
    cy.contains("By support engineer").should("be.visible")
    cy.contains("Sam Support").should("be.visible")
  })

  describe("most recurring issues", () => {
    it("headlines the most-raised bug, ticket and feature request, each with what to do about it", () => {
      cy.dataCy("recurring-top-bug")
        .should("contain", "Most reported bug")
        .and("contain", "Export button does nothing")
        .and("contain", "Came back after a fix")
      cy.dataCy("recurring-top-bug").find('[data-cy="recurring-top-count"]').should("have.text", "3")
      // Filed again after it was fixed once — the signal that outranks "merely open".
      cy.dataCy("recurring-top-bug")
        .find('[data-cy="recurring-advice"]')
        .should("contain", "1 of 3 reports were filed after it had been fixed")

      cy.dataCy("recurring-top-ticket")
        .should("contain", "Most reported ticket")
        .and("contain", "Cannot log in from my iPhone")
        .and("contain", "Still open")
      cy.dataCy("recurring-top-ticket")
        .find('[data-cy="recurring-advice"]')
        .should("contain", "2 of 2 reports are still open")

      cy.dataCy("recurring-top-feature_request")
        .should("contain", "Most requested feature")
        .and("contain", "Dark mode for reports")
        .and("contain", "23 votes")
        .and("contain", "Not delivered yet")
    })

    it("opens on the kind with the biggest offender and lists each kind ranked", () => {
      // The feature request (4) outnumbers the top bug (3) and ticket (2).
      cy.dataCy("recurring-tab-feature_request").should("have.attr", "data-state", "active")
      cy.dataCy("recurring-row").should("have.length", 1).and("contain", "Dark mode for reports").and("contain", "23")

      cy.dataCy("recurring-tab-bug").should("contain", "2").click()
      cy.dataCy("recurring-row").should("have.length", 2)
      cy.dataCy("recurring-row").eq(0).should("contain", "Export button does nothing").and("contain", "BF-20260804-003")
      cy.dataCy("recurring-row").eq(1).should("contain", "Login times out on slow networks").and("contain", "Resolved")
    })

    it("marks the groups the team confirmed by linking, but not the identical-title ones", () => {
      cy.dataCy("recurring-tab-bug").click()
      cy.dataCy("recurring-row").eq(0).find('[data-cy="recurring-linked"]').should("exist")
      cy.dataCy("recurring-row").eq(1).find('[data-cy="recurring-linked"]').should("not.exist")
    })

    it("links each row to its own ticket page", () => {
      cy.dataCy("recurring-tab-bug").click()
      cy.dataCy("recurring-row").eq(0).find("a").should("have.attr", "href", "/projects/e2e-proj-1/bugs/e2e-bug-1")
      cy.dataCy("recurring-tab-ticket").click()
      cy.dataCy("recurring-row")
        .eq(0)
        .find("a")
        .should("have.attr", "href", "/projects/e2e-proj-1?tab=feedback&ticket=TKT-20260820-042")
    })

    it("opens every report in a group, by the group's own key", () => {
      cy.dataCy("recurring-top-bug").click()

      cy.wait("@slaTickets")
        .its("request.url")
        .then((url) => {
          expect(decodeURIComponent(url)).to.include("recurringKey=bug:e2e-bug-1")
        })
      cy.contains("[role=dialog]", '"Export button does nothing" — 3 reports').should("be.visible")
    })

    it("drills into a table row the same way", () => {
      cy.dataCy("recurring-tab-bug").click()
      cy.dataCy("recurring-row").eq(1).click()

      cy.wait("@slaTickets")
        .its("request.url")
        .then((url) => {
          expect(decodeURIComponent(url)).to.include("recurringKey=title:e2e-proj-1:bug:login times out on slow networks")
        })
    })
  })

  it("drills down from a KPI card to the tickets behind it", () => {
    cy.dataCy("sla-kpi-breached").click()
    cy.wait("@slaTickets").its("request.url").should("include", "metric=breached")
    cy.contains("[role=dialog]", "SLA breached").should("be.visible")
    cy.contains("[role=dialog]", "TKT-20260820-042").should("be.visible")
    // Product-org tickets deep-link to All tickets; IT-queue ones are labelled instead.
    cy.get("[role=dialog] a[href*='/all-feedback?q=TKT-20260820-042']").should("exist")
    cy.contains("[role=dialog]", "IT queue").should("be.visible")
  })

  it("re-queries with the filters applied", () => {
    cy.selectDropdown("[data-cy=sla-range]", "Last 7 days")
    cy.wait("@slaOverview").its("request.url").should("include", "from=")
  })

  it("lets an admin view and save the SLA rules", () => {
    cy.dataCy("sla-rules-button").click()
    cy.wait("@slaSettings")
    cy.contains("[role=dialog]", "SLA rules").should("be.visible")
    cy.get("[role=dialog] input[type=number]").first().clear().type("2")
    cy.contains("[role=dialog] label", "Resolved").click()
    cy.contains("[role=dialog] button", "Save rules").click()
    cy.wait("@slaSaveSettings").its("request.body").should((body) => {
      expect(body.targets.critical.firstResponseHours).to.eq(2)
      expect(body.pausedStatuses).to.deep.eq(["resolved"])
    })
    cy.contains("SLA rules saved").should("be.visible")
  })

  it("switching back to Overview shows the test-management stats", () => {
    cy.dataCy("dashboard-tab-overview").click()
    cy.wait("@overview")
    cy.dataCy("stat-projects").should("contain", "3")
    cy.location("search").should("eq", "")
  })
})

describe("Dashboard — SLA & support tab, nothing recurring", () => {
  it("says so plainly when nothing has been raised more than once", () => {
    cy.login("admin")
    cy.stubDashboard()
    cy.stubSla()
    cy.fixture("sla/overview").then((overview) => {
      cy.intercept("GET", apiPath("/sla/overview"), { body: ok({ ...overview, recurring: [] }) }).as("quietOverview")
    })
    cy.visit("/dashboard?tab=sla")
    cy.wait("@quietOverview")

    cy.dataCy("recurring-empty").should("contain", "Nothing has been raised more than once")
    cy.dataCy("recurring-top-bug").should("contain", "No bug has been raised more than once")
    cy.dataCy("recurring-top-ticket").should("contain", "No ticket has been raised more than once")
    cy.dataCy("recurring-top-feature_request").should("contain", "No feature request has been raised more than once")
    cy.dataCy("recurring-row").should("not.exist")
  })
})

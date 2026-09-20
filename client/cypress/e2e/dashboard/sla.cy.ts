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
    cy.contains("Recurring issues").should("be.visible")
    cy.contains("Export button does nothing").should("be.visible")
    cy.contains("By team member").should("be.visible")
    cy.contains("Uche Tester").should("be.visible")
    cy.contains("By support engineer").should("be.visible")
    cy.contains("Sam Support").should("be.visible")
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

import { listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"
const BUG_ID = "e2e-bug-1"
const BUG_URL = `/projects/${PROJECT_ID}/bugs/${BUG_ID}`
const OLD_BUG = "e2e-bug-old"

// The scenario this feature exists for: the sign-up button bug was reported in
// March, fixed, and then reported again. Linking the new report to the old one is
// what lets the team see that the problem has now been raised more than once.

// A created-link response, seen from the ticket that was linked FROM.
const createdLink = (overrides: Record<string, unknown> = {}) =>
  ok({
    link: {
      linkId: "e2e-link-new",
      linkType: "duplicate",
      ticket: {
        type: "bug",
        id: OLD_BUG,
        projectId: PROJECT_ID,
        referenceCode: "BF-20260301-014",
        title: "Sign up button not working",
        status: "Fixed",
        feedbackType: null,
        createdAt: "2026-03-01T09:00:00.000Z",
      },
      linkedAt: "2026-09-30T09:00:00.000Z",
      linkedBy: "Uche Tester",
    },
    redirectedFrom: null,
    ...overrides,
  })

// Opens the fixture bug's page. `links` replaces the default "nothing linked", and
// `similar` the default "nothing looks similar".
function openBug(links?: unknown, similar?: unknown) {
  cy.login("admin")
  cy.fixture("projects/list").then((projects) => {
    cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
  })
  cy.fixture("bugs/list").then((bugs) => {
    cy.interceptApi("GET", `/bugs/${BUG_ID}`, { body: ok(bugs[0]) }, "bug")
  })
  cy.interceptApi("GET", `/bugs/${BUG_ID}/attachments`, { body: ok([]) }, "attachments")
  cy.interceptApi("GET", `/bugs/${BUG_ID}/history`, { body: ok([]) }, "history")
  if (links) cy.interceptApi("GET", "/ticket-links", { body: ok(links) }, "ticketLinks")
  if (similar) cy.interceptApi("GET", "/ticket-links/similar", { body: ok(similar) }, "similar")
  cy.visit(BUG_URL)
  cy.wait("@bug")
}

describe("Ticket links — a ticket's page", () => {
  it("shows how many times a problem has been raised, each report listed", () => {
    cy.fixture("ticketLinks/occurrences").then((links) => openBug(links))

    cy.wait("@ticketLinks").its("request.url").should("include", "type=bug").and("include", `id=${BUG_ID}`)

    cy.dataCy("header-occurrences").should("contain", "Reported 3 times")
    cy.dataCy("occurrence-count").should("contain", "Reported 3 times")
    cy.dataCy("occurrence").should("have.length", 3)
    // Original first, oldest to newest, across kinds of ticket.
    cy.dataCy("occurrence").eq(0).should("contain", "BF-20260625-001").and("contain", "Original").and("contain", "This ticket")
    cy.dataCy("occurrence").eq(1).should("contain", "BF-20260801-007").and("contain", "Fixed")
    cy.dataCy("occurrence").eq(2).should("contain", "TKT-20260920-009").and("contain", "Acknowledged")

    cy.dataCy("related-ticket").should("have.length", 1).and("contain", "FR-20260601-001")
  })

  it("links to each ticket's own page", () => {
    cy.fixture("ticketLinks/occurrences").then((links) => openBug(links))

    cy.contains('[data-cy="occurrence"]', "BF-20260801-007").find("a").should("have.attr", "href", `/projects/${PROJECT_ID}/bugs/e2e-bug-7`)
    // A feedback ticket has no page of its own — it opens in the project's Tickets tab.
    cy.contains('[data-cy="occurrence"]', "TKT-20260920-009")
      .find("a")
      .should("have.attr", "href", `/projects/${PROJECT_ID}?tab=feedback&ticket=TKT-20260920-009`)
    cy.contains('[data-cy="related-ticket"]', "FR-20260601-001")
      .find("a")
      .should("have.attr", "href", `/projects/${PROJECT_ID}/feature-requests/e2e-fr-1`)
  })

  it("says nothing is linked when nothing is", () => {
    openBug()
    cy.dataCy("no-links").should("be.visible")
    cy.dataCy("header-occurrences").should("not.exist")
  })

  it("removes a link after confirming, and leaves the ticket alone", () => {
    cy.fixture("ticketLinks/occurrences").then((links) => openBug(links))
    cy.interceptApi("DELETE", "/ticket-links/e2e-link-1", { body: ok(null) }, "unlink")

    // The original has no link to remove; each repeat and each related ticket does.
    cy.dataCy("unlink-ticket").should("have.length", 3)
    cy.contains('[data-cy="occurrence"]', "BF-20260801-007").find('[data-cy="unlink-ticket"]').click()
    cy.contains("Neither ticket is deleted").should("be.visible")
    cy.dataCy("confirm-ok").click()

    cy.wait("@unlink")
    cy.contains("Link removed").should("be.visible")
  })

  describe("linking a ticket", () => {
    beforeEach(() => {
      openBug()
      cy.fixture("ticketLinks/similar").then((similar) => {
        cy.interceptApi("GET", "/ticket-links/candidates", { body: ok(similar) }, "candidates")
      })
      cy.interceptApi("POST", "/ticket-links", { body: createdLink() }, "createLink")
      cy.dataCy("link-ticket").click()
      cy.dataCy("link-ticket-search").type("sign up")
      cy.wait("@candidates").its("request.url").should("include", "projectId=e2e-proj-1").and("include", "q=sign+up")
      cy.dataCy("ticket-candidate").should("have.length", 1).and("contain", "BF-20260301-014")
      cy.dataCy("ticket-candidate").click()
    })

    it("marks this ticket as a repeat of the one picked", () => {
      cy.dataCy("relation-repeat-of").should("be.checked")
      cy.dataCy("link-ticket-submit").click()

      cy.wait("@createLink").its("request.body").should("deep.equal", {
        sourceType: "bug",
        sourceId: BUG_ID,
        targetType: "bug",
        targetId: OLD_BUG,
        linkType: "duplicate",
      })
      cy.contains("Tickets linked").should("be.visible")
    })

    it("marks the ticket picked as a repeat of this one", () => {
      cy.dataCy("relation-has-repeat").check()
      cy.dataCy("link-ticket-submit").click()

      // The direction flips: the picked ticket is the repeat, so it is the source.
      cy.wait("@createLink").its("request.body").should("deep.equal", {
        sourceType: "bug",
        sourceId: OLD_BUG,
        targetType: "bug",
        targetId: BUG_ID,
        linkType: "duplicate",
      })
    })

    it("links the two as related, not as a repeat", () => {
      cy.dataCy("relation-related").check()
      cy.dataCy("link-ticket-submit").click()

      cy.wait("@createLink").its("request.body").should("deep.include", { linkType: "related", sourceId: BUG_ID, targetId: OLD_BUG })
    })

    it("explains when the ticket picked was itself a repeat, so the link went to the original", () => {
      cy.interceptApi(
        "POST",
        "/ticket-links",
        {
          body: createdLink({
            redirectedFrom: {
              type: "bug",
              id: "e2e-bug-7",
              projectId: PROJECT_ID,
              referenceCode: "BF-20260801-007",
              title: "Login button not responding again",
              status: "Fixed",
              feedbackType: null,
              createdAt: "2026-08-01T09:00:00.000Z",
            },
          }),
        },
        "redirectedLink"
      )
      cy.dataCy("link-ticket-submit").click()

      cy.wait("@redirectedLink")
      cy.contains("BF-20260801-007 is itself a repeat of BF-20260301-014").should("be.visible")
    })

    it("shows the server's reason when the link is refused", () => {
      cy.interceptApi(
        "POST",
        "/ticket-links",
        { statusCode: 409, body: { success: false, message: "These tickets are already linked as related", statusCode: 409, data: null, errors: [] } },
        "refusedLink"
      )
      cy.dataCy("link-ticket-submit").click()

      cy.wait("@refusedLink")
      cy.contains("These tickets are already linked as related").should("be.visible")
    })
  })

  describe("possible repeats", () => {
    it("suggests earlier tickets with a similar title and links one as the same problem", () => {
      cy.fixture("ticketLinks/similar").then((similar) => openBug(undefined, similar))
      cy.interceptApi("POST", "/ticket-links", { body: createdLink() }, "createLink")
      cy.wait("@similar").its("request.url").should("include", `excludeId=${BUG_ID}`).and("include", "excludeType=bug")

      cy.dataCy("possible-repeats").should("be.visible")
      cy.dataCy("suggestion").should("have.length", 1).and("contain", "BF-20260301-014")
      cy.dataCy("suggestion-repeat").click()

      cy.wait("@createLink").its("request.body").should("deep.equal", {
        sourceType: "bug",
        sourceId: BUG_ID,
        targetType: "bug",
        targetId: OLD_BUG,
        linkType: "duplicate",
      })
    })

    it("does not offer 'same problem' for an original that already has repeats", () => {
      cy.fixture("ticketLinks/occurrences").then((links) => {
        cy.fixture("ticketLinks/similar").then((similar) => openBug(links, similar))
      })

      cy.dataCy("suggestion").should("have.length", 1)
      // A ticket that has repeats of its own can't itself become a repeat.
      cy.dataCy("suggestion-repeat").should("not.exist")
      cy.dataCy("suggestion-related").should("be.visible")
    })
  })
})

describe("Ticket links — reporting a bug", () => {
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
    cy.fixture("ticketLinks/similar").then((similar) => {
      cy.interceptApi("GET", "/ticket-links/similar", { body: ok(similar) }, "similar")
    })
    cy.visit(`/projects/${PROJECT_ID}?tab=bugs`)
    cy.wait("@bugs")
    cy.dataCy("bug-card").should("have.length", 1)
  })

  it("warns that a bug may already have been reported while its title is typed", () => {
    cy.dataCy("report-bug").click()
    cy.dataCy("similar-tickets").should("not.exist")

    cy.get("#title").type("Sign up button is broken")
    cy.wait("@similar").its("request.url").should("include", "projectId=e2e-proj-1").and("match", /title=Sign/)

    cy.dataCy("similar-tickets").should("be.visible").and("contain", "This may have been raised before")
    cy.dataCy("similar-ticket").should("have.length", 1).and("contain", "BF-20260301-014").and("contain", "Fixed")
  })

  it("saves the new report and records it as a repeat of the earlier one", () => {
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("POST", "/bugs", { body: ok({ ...bugs[0], id: "e2e-bug-new" }) }, "createBug")
    })
    cy.interceptApi("POST", "/ticket-links", { body: createdLink() }, "createLink")

    cy.dataCy("report-bug").click()
    cy.get("#title").type("Sign up button is broken")
    cy.dataCy("similar-ticket").should("have.length", 1)
    cy.dataCy("mark-repeat").click()
    cy.dataCy("repeat-summary").should("contain", "BF-20260301-014")
    cy.get("#description").type("Clicking Sign up does nothing.")
    cy.dataCy("bug-submit").click()

    // The bug is still filed — the link is made once it exists.
    cy.wait("@createBug").its("request.body").should("deep.include", { title: "Sign up button is broken" })
    cy.wait("@createLink").its("request.body").should("deep.equal", {
      sourceType: "bug",
      sourceId: "e2e-bug-new",
      targetType: "bug",
      targetId: OLD_BUG,
      linkType: "duplicate",
    })
    cy.contains("Bug reported").should("be.visible")
  })

  it("files the bug on its own when no earlier report is picked", () => {
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("POST", "/bugs", { body: ok({ ...bugs[0], id: "e2e-bug-new" }) }, "createBug")
    })
    cy.interceptApi("POST", "/ticket-links", { body: createdLink() }, "createLink")

    cy.dataCy("report-bug").click()
    cy.get("#title").type("Sign up button is broken")
    cy.dataCy("similar-ticket").should("have.length", 1)
    cy.get("#description").type("Clicking Sign up does nothing.")
    cy.dataCy("bug-submit").click()

    cy.wait("@createBug")
    cy.contains("Bug reported").should("be.visible")
    cy.get("@createLink.all").should("have.length", 0)
  })

  it("takes the suggestions away when the title is cleared", () => {
    cy.dataCy("report-bug").click()
    cy.get("#title").type("Sign up button is broken")
    cy.dataCy("similar-tickets").should("be.visible")

    cy.get("#title").clear()
    cy.dataCy("similar-tickets").should("not.exist")
  })

  it("forgets what was picked once the title is cleared", () => {
    cy.dataCy("report-bug").click()
    cy.get("#title").type("Sign up button is broken")
    cy.dataCy("mark-repeat").click()
    cy.dataCy("repeat-summary").should("be.visible")

    cy.get("#title").clear()
    cy.dataCy("similar-tickets").should("not.exist")

    // Typing again starts from a clean slate — nothing is still marked.
    cy.get("#title").type("Sign up button is broken")
    cy.dataCy("similar-ticket").should("have.length", 1)
    cy.dataCy("repeat-summary").should("not.exist")
    cy.dataCy("mark-repeat").should("have.attr", "aria-pressed", "false")
  })

  it("shows the closest few and keeps the rest behind 'Show more'", () => {
    cy.fixture("ticketLinks/similar").then(([first]) => {
      const many = [1, 2, 3, 4, 5].map((n) => ({
        ...first,
        id: `e2e-bug-old-${n}`,
        referenceCode: `BF-20260301-0${10 + n}`,
        title: `Sign up button not working (${n})`,
      }))
      cy.interceptApi("GET", "/ticket-links/similar", { body: ok(many) }, "manySimilar")
    })

    cy.dataCy("report-bug").click()
    cy.get("#title").type("Sign up button is broken")
    cy.wait("@manySimilar")

    cy.dataCy("similar-ticket").should("have.length", 3)
    cy.dataCy("similar-toggle").should("contain", "Show 2 more").click()
    cy.dataCy("similar-ticket").should("have.length", 5)
    cy.dataCy("similar-toggle").should("contain", "Show fewer").click()
    cy.dataCy("similar-ticket").should("have.length", 3)
  })

  it("lets a pick be undone by choosing it again", () => {
    cy.dataCy("report-bug").click()
    cy.get("#title").type("Sign up button is broken")
    cy.dataCy("mark-repeat").click()
    cy.dataCy("repeat-summary").should("be.visible")
    cy.dataCy("mark-repeat").click()
    cy.dataCy("repeat-summary").should("not.exist")
  })
})

describe("Ticket links — lists", () => {
  it("badges a bug that has been raised before, and each repeat of it", () => {
    cy.login("user")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.fixture("dashboard/overview").then((overview) => {
      cy.interceptApi("GET", "/dashboard/overview", { body: ok(overview) }, "overview")
    })
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("GET", "/bugs", { body: ok(bugs, listMeta(bugs.length)) }, "bugs")
    })
    cy.interceptApi(
      "GET",
      "/ticket-links/summary",
      { body: ok({ [BUG_ID]: { duplicateCount: 2, isDuplicate: false, relatedCount: 1 } }) },
      "summary"
    )
    cy.visit(`/projects/${PROJECT_ID}?tab=bugs`)

    cy.wait("@summary").its("request.url").should("include", "type=bug").and("include", `ids=${BUG_ID}`)
    cy.contains('[data-cy="bug-card"]', "Login button unresponsive on Safari").within(() => {
      cy.dataCy("repeat-count").should("contain", "Reported 3×")
      cy.dataCy("related-count").should("contain", "1")
      cy.dataCy("repeat-badge").should("not.exist")
    })
  })

  it("badges a feature request that is a repeat of an earlier one", () => {
    cy.login("user")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.fixture("dashboard/overview").then((overview) => {
      cy.interceptApi("GET", "/dashboard/overview", { body: ok(overview) }, "overview")
    })
    cy.fixture("featureRequests/list").then((requests) => {
      cy.interceptApi("GET", "/feature-requests", { body: ok(requests, listMeta(requests.length)) }, "requests")
    })
    cy.interceptApi(
      "GET",
      "/ticket-links/summary",
      { body: ok({ "e2e-fr-1": { duplicateCount: 0, isDuplicate: true, relatedCount: 0 } }) },
      "summary"
    )
    cy.visit(`/projects/${PROJECT_ID}?tab=feature-requests`)

    cy.wait("@summary").its("request.url").should("include", "type=feature_request")
    cy.contains('[data-cy="feature-request-card"]', "Dark mode for reports").within(() => {
      cy.dataCy("repeat-badge").should("contain", "Repeat")
      cy.dataCy("repeat-count").should("not.exist")
    })
  })
})

describe("Ticket links — feature requests and tickets", () => {
  it("shows a feature request's links on its page", () => {
    cy.login("admin")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.fixture("featureRequests/list").then((requests) => {
      cy.interceptApi("GET", "/feature-requests/e2e-fr-1", { body: ok(requests[0]) }, "request")
    })
    cy.interceptApi("GET", "/feature-requests/e2e-fr-1/attachments", { body: ok([]) }, "attachments")
    cy.interceptApi("GET", "/feature-requests/e2e-fr-1/history", { body: ok([]) }, "history")
    cy.fixture("ticketLinks/occurrences").then((links) => {
      cy.interceptApi("GET", "/ticket-links", { body: ok(links) }, "ticketLinks")
    })
    cy.visit(`/projects/${PROJECT_ID}/feature-requests/e2e-fr-1`)

    cy.wait("@ticketLinks").its("request.url").should("include", "type=feature_request").and("include", "id=e2e-fr-1")
    cy.dataCy("related-tickets").should("be.visible")
    cy.dataCy("header-occurrences").should("contain", "Reported 3 times")
  })

  describe("feedback tickets", () => {
    beforeEach(() => {
      cy.login("admin")
      cy.fixture("projects/list").then((projects) => {
        cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
      })
      cy.fixture("dashboard/overview").then((overview) => {
        cy.interceptApi("GET", "/dashboard/overview", { body: ok(overview) }, "overview")
      })
      cy.fixture("ticketLinks/feedback").then((tickets) => {
        cy.interceptApi("GET", "/feedback", { body: ok(tickets, listMeta(tickets.length)) }, "tickets")
      })
      cy.interceptApi("GET", "/feedback/e2e-fb-1/history", { body: ok([]) }, "feedbackHistory")
      cy.fixture("ticketLinks/occurrences").then((links) => {
        cy.interceptApi("GET", "/ticket-links", { body: ok(links) }, "ticketLinks")
      })
    })

    it("badges a ticket that has been raised before", () => {
      cy.interceptApi(
        "GET",
        "/ticket-links/summary",
        { body: ok({ "e2e-fb-1": { duplicateCount: 1, isDuplicate: false, relatedCount: 0 } }) },
        "summary"
      )
      cy.visit(`/projects/${PROJECT_ID}?tab=feedback`)

      cy.wait("@summary").its("request.url").should("include", "type=feedback")
      cy.contains('[data-cy="ticket-row"]', "Cannot log in from my iPhone")
        .find('[data-cy="repeat-count"]')
        .should("contain", "Reported 2×")
    })

    it("opens the ticket a link points at, then drops ?ticket= from the address", () => {
      cy.visit(`/projects/${PROJECT_ID}?tab=feedback&ticket=TKT-20260920-009`)

      cy.contains("Manage ticket TKT-20260920-009").should("be.visible")
      cy.dataCy("related-tickets").should("be.visible")
      cy.location("search").should("not.include", "ticket=")
    })
  })
})

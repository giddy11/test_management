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

  it("client companies card on the project Tickets tab", () => {
    cy.login("admin")
    stubProject()
    cy.interceptApi("GET", "/feedback", { body: ok([], listMeta(0)) }, "feedback")
    cy.interceptApi(
      "GET",
      "/client-companies",
      {
        body: ok([
          {
            id: "e2e-cc-1",
            projectId: PROJECT_ID,
            name: "Northwind Logistics",
            contactEmail: "it@northwind.example",
            feedbackToken: "e2e-northwind-token",
            autoAssignEnabled: true,
            supporterCount: 3,
            createdAt: "2026-06-02T09:00:00.000Z",
          },
          {
            id: "e2e-cc-2",
            projectId: PROJECT_ID,
            name: "Contoso Retail",
            contactEmail: null,
            feedbackToken: null,
            autoAssignEnabled: false,
            supporterCount: 1,
            createdAt: "2026-06-18T09:00:00.000Z",
          },
        ]),
      },
      "companies"
    )
    cy.viewport(1440, 900)
    cy.visit(`/projects/${PROJECT_ID}?tab=feedback`, lightTheme)
    cy.contains("Client companies").should("be.visible")
    cy.contains("Northwind Logistics").should("be.visible")
    // The client-companies card sits below the public-form card — scroll it
    // into frame rather than capturing the top of the tab.
    cy.contains("Client companies").scrollIntoView({ offset: { top: -120, left: 0 } })
    shoot("client-companies")
  })

  it("IT supporter ticket queue", () => {
    cy.login("admin", {
      id: "e2e-supporter-1",
      firstName: "Ife",
      lastName: "Support",
      name: "Ife Support",
      email: "ife@northwind.example",
      role: "it_support",
      companyName: "Northwind Logistics",
      clientCompanyId: "e2e-cc-1",
      isSupportLead: true,
      isPrimarySupportLead: true,
    })
    cy.interceptApi(
      "GET",
      "/support/feedback/teammates",
      {
        body: ok([
          { id: "e2e-supporter-1", name: "Ife Support", email: "ife@northwind.example", isSupportLead: true },
          { id: "e2e-supporter-2", name: "Tomi Desk", email: "tomi@northwind.example", isSupportLead: false },
        ]),
      },
      "teammates"
    )
    const queue = [
      {
        id: "e2e-tkt-1",
        ticketNumber: 42,
        ticketCode: "TKT-20260728-042",
        projectId: PROJECT_ID,
        type: "bug",
        title: "Invoice PDF downloads blank",
        description:
          "Downloading an invoice from the billing page produces a 0 KB PDF. Started this morning, affects the whole finance team.",
        suiteName: "Billing",
        submitterName: "Ngozi Buyer",
        submitterEmail: "ngozi@northwind.example",
        submitterPhone: null,
        status: "logged",
        supportStatus: "logged",
        assignedSupporterId: "e2e-supporter-2",
        assignedSupporterName: "Tomi Desk",
        assignees: [],
        attachments: [{ id: "a1", url: "" }],
        commentCount: 2,
        rating: null,
        createdAt: "2026-07-28T08:12:00.000Z",
      },
      {
        id: "e2e-tkt-2",
        ticketNumber: 41,
        ticketCode: "TKT-20260727-041",
        projectId: PROJECT_ID,
        type: "complaint",
        title: "Password reset email never arrives",
        description: "Three of our users tried the reset link yesterday and got nothing.",
        suiteName: null,
        submitterName: "Kofi Ops",
        submitterEmail: "kofi@northwind.example",
        submitterPhone: null,
        status: "logged",
        supportStatus: "logged",
        assignedSupporterId: null,
        assignedSupporterName: null,
        assignees: [],
        attachments: [],
        commentCount: 0,
        rating: null,
        createdAt: "2026-07-27T15:40:00.000Z",
      },
    ]
    cy.interceptApi("GET", "/support/feedback", { body: ok(queue, listMeta(queue.length)) }, "queue")
    cy.viewport(1440, 900)
    cy.visit("/support", lightTheme)
    cy.contains("h1", "Ticket queue").should("be.visible")
    cy.contains("Invoice PDF downloads blank").should("be.visible")
    shoot("support-queue")
  })

  // The inbox thread pane isn't captured: its messages come from a realtime
  // Firestore listener, which the stubbed e2e mode has no credentials for, so
  // it never leaves "Loading…". The settings card + conversation list are the
  // parts worth documenting anyway.
  it("live chat widget settings", () => {
    cy.login("admin")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi(
        "GET",
        `/projects/${PROJECT_ID}`,
        { body: ok({ ...projects[0], liveChatToken: "e2e-live-chat-token", members: [] }) },
        "project"
      )
    })
    cy.interceptApi(
      "GET",
      `/live-chat/projects/${PROJECT_ID}/settings`,
      {
        body: ok({
          projectId: PROJECT_ID,
          displayName: "Apollo Support",
          logoUrl: null,
          greetingMessage: "Hi! How can we help?",
          offlineMessage: "We're away right now — leave a message and we'll reply by email.",
          brandColor: "#4f46e5",
          requireAccount: false,
          updatedAt: "2026-07-20T09:00:00.000Z",
        }),
      },
      "liveChatSettings"
    )
    cy.interceptApi(
      "GET",
      "/live-chat/conversations",
      {
        body: ok([
          {
            id: "e2e-conv-1",
            projectId: PROJECT_ID,
            visitor: {
              id: "e2e-vis-1",
              name: "Amara Okoye",
              email: "amara@example.com",
              phone: null,
              currentUrl: "https://apollo.example/pricing",
              referrer: null,
              firstSeenAt: "2026-07-28T09:55:00.000Z",
              lastSeenAt: "2026-07-28T10:02:00.000Z",
            },
            status: "new",
            assignedAgent: null,
            lastMessageAt: "2026-07-28T10:02:00.000Z",
            lastMessagePreview: "Does the Team plan include SSO?",
            lastSenderRole: "visitor",
            visitorUnread: 0,
            agentUnread: 2,
            createdAt: "2026-07-28T09:55:00.000Z",
            closedAt: null,
          },
          {
            id: "e2e-conv-2",
            projectId: PROJECT_ID,
            visitor: {
              id: "e2e-vis-2",
              name: "Sam Rivers",
              email: "sam@example.com",
              phone: null,
              currentUrl: "https://apollo.example/docs",
              referrer: null,
              firstSeenAt: "2026-07-28T08:30:00.000Z",
              lastSeenAt: "2026-07-28T08:44:00.000Z",
            },
            status: "in_progress",
            assignedAgent: { id: "e2e-admin-0001", name: "Ada Admin" },
            lastMessageAt: "2026-07-28T08:44:00.000Z",
            lastMessagePreview: "Perfect, that worked — thanks!",
            lastSenderRole: "visitor",
            visitorUnread: 0,
            agentUnread: 0,
            createdAt: "2026-07-28T08:30:00.000Z",
            closedAt: null,
          },
        ]),
      },
      "conversations"
    )
    cy.visit(`/projects/${PROJECT_ID}?tab=live-chat`, lightTheme)
    cy.contains("Live chat widget").should("be.visible")
    cy.contains("Amara Okoye").should("be.visible")
    shoot("live-chat", 1000)
  })

  it("live chat widget — the visitor's view", () => {
    const WIDGET_TOKEN = "e2e-live-chat-token"
    cy.interceptApi(
      "GET",
      `/public/live-chat/${WIDGET_TOKEN}`,
      {
        body: ok({
          projectId: PROJECT_ID,
          displayName: "Apollo Support",
          logoUrl: null,
          greetingMessage: "Hi! How can we help?",
          offlineMessage: "We're away right now — leave a message and we'll reply by email.",
          brandColor: "#4f46e5",
          requireAccount: false,
        }),
      },
      "widgetConfig"
    )
    cy.interceptApi(
      "POST",
      `/public/live-chat/${WIDGET_TOKEN}/visitors`,
      {
        body: ok({
          id: "e2e-vis-9",
          name: null,
          email: null,
          phone: null,
          currentUrl: null,
          referrer: null,
          firstSeenAt: "2026-07-28T10:00:00.000Z",
          lastSeenAt: "2026-07-28T10:00:00.000Z",
        }),
      },
      "startVisitor"
    )
    cy.interceptApi("POST", `/public/live-chat/${WIDGET_TOKEN}/conversation`, { body: ok(null) }, "conversation")
    cy.viewport(420, 680)
    cy.visit(`/widget/live-chat/${WIDGET_TOKEN}`, lightTheme)
    cy.contains("Send us a message").click()
    cy.contains("Your email").should("be.visible")
    shoot("live-chat-widget")
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

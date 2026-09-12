// cypress/support/commands.ts — reusable commands for the TestMate E2E suite.
//
// The default strategy is fully network-stubbed: dev and prod share one
// database, so tests must never hit a real API. cy.login() seeds fake tokens
// and stubs /auth/me plus the layout calls every authenticated page makes.
// cy.loginByApi() is the opt-in live-mode alternative (see live specs).

import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, apiPath, listMeta, ok } from "./api"
import type { ApiEnvelope } from "./api"

type AppRole = "user" | "admin" | "superadmin"
type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Select an element by its data-cy attribute. */
      dataCy(id: string): Chainable<JQuery<HTMLElement>>
      /** Intercept an /api/v1 path (exact, query-string tolerant) with an envelope body. */
      interceptApi(
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        path: string,
        response: { body: ApiEnvelope; statusCode?: number },
        alias: string
      ): Chainable<null>
      /** Stubbed login: seeds fake tokens, stubs /auth/me (alias @me) and layout calls. */
      login(role?: AppRole, overrides?: Record<string, unknown>): Chainable<void>
      /** Stub the calls the authenticated layout always makes (notifications, banner, what's-new). */
      stubLayout(): Chainable<void>
      /** Stub the dashboard page data (aliases @overview, @recentRuns, @projects). */
      stubDashboard(): Chainable<void>
      /** Stub the SLA & support tab (overview, drill-down tickets, filter options, rules). */
      stubSla(): Chainable<void>
      /** Log out through the sidebar user menu. */
      logout(): Chainable<void>
      /** Wait until the shared PageLoader has disappeared. */
      waitForLoader(): Chainable<void>
      /** Pick an option in a radix Select. Keyboard-driven — synthetic clicks don't register on selects inside dialogs. */
      selectDropdown(triggerSelector: string, option: string): Chainable<void>
      /** Real API login via cy.session — live mode only, never in the stubbed suite. */
      loginByApi(email: string, password: string): Chainable<void>
    }
  }
}

Cypress.Commands.add("dataCy", (id: string) => cy.get(`[data-cy="${id}"]`))

Cypress.Commands.add(
  "interceptApi",
  (method: ApiMethod, path: string, response: { body: ApiEnvelope; statusCode?: number }, alias: string) => {
    return cy
      .intercept(method, apiPath(path), {
        statusCode: response.statusCode ?? response.body.statusCode ?? 200,
        body: response.body,
      })
      .as(alias)
  }
)

Cypress.Commands.add("stubLayout", () => {
  cy.interceptApi("GET", "/notifications/unread-count", { body: ok({ count: 0 }) }, "unreadCount")
  cy.interceptApi("GET", "/notifications", { body: ok([], listMeta(0)) }, "notifications")
  cy.interceptApi("GET", "/site-banner/current", { body: ok(null) }, "siteBanner")
  cy.interceptApi("GET", "/app-updates/unseen", { body: ok([]) }, "appUpdates")
  cy.interceptApi("POST", "/app-updates/seen", { body: ok(null) }, "appUpdatesSeen")
  cy.interceptApi("POST", "/auth/logout", { body: ok(null) }, "logoutApi")
})

Cypress.Commands.add("login", (role: AppRole = "user", overrides: Record<string, unknown> = {}) => {
  cy.fixture(`users/${role}`).then((user) => {
    const current = { ...user, ...overrides }
    cy.intercept("GET", apiPath("/auth/me"), { body: ok(current) }).as("me")
    cy.wrap(current, { log: false }).as("currentUser")
  })
  cy.stubLayout()
  // Seed tokens before the app boots — the spec frame shares the baseUrl
  // origin, so this storage is what the app reads on cy.visit().
  cy.then(() => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, "e2e-access-token")
    window.localStorage.setItem(REFRESH_TOKEN_KEY, "e2e-refresh-token")
  })
})

Cypress.Commands.add("stubDashboard", () => {
  cy.fixture("dashboard/overview").then((overview) => {
    cy.intercept("GET", apiPath("/dashboard/overview"), { body: ok(overview) }).as("overview")
  })
  cy.interceptApi("GET", "/dashboard/recent-runs", { body: ok([], listMeta(0)) }, "recentRuns")
  cy.interceptApi("GET", "/projects", { body: ok([], listMeta(0)) }, "projects")
})

Cypress.Commands.add("logout", () => {
  cy.dataCy("user-menu").click()
  cy.dataCy("logout").click()
})

Cypress.Commands.add("waitForLoader", () => {
  cy.dataCy("page-loader").should("not.exist")
})

Cypress.Commands.add("selectDropdown", (triggerSelector: string, option: string) => {
  cy.get(triggerSelector).click()
  // Radix Select items don't respond to synthetic clicks when the select sits
  // inside a Dialog — focus the option and confirm with Enter instead, which
  // drives the same selection code path as a keyboard user.
  cy.contains('[role="option"]', option).focus().type("{enter}")
  cy.get('[role="listbox"]').should("not.exist")
})

Cypress.Commands.add("loginByApi", (email: string, password: string) => {
  cy.session(
    ["api-login", email],
    () => {
      cy.request("POST", `${Cypress.env("apiUrl")}/api/v1/auth/login`, { email, password }).then(
        ({ body }) => {
          expect(body.success, body.message).to.be.true
          window.localStorage.setItem(ACCESS_TOKEN_KEY, body.data.tokens.accessToken)
          window.localStorage.setItem(REFRESH_TOKEN_KEY, body.data.tokens.refreshToken)
        }
      )
    },
    { cacheAcrossSpecs: true }
  )
})

export {}

Cypress.Commands.add("stubSla", () => {
  cy.fixture("sla/overview").then((overview) => {
    cy.intercept("GET", apiPath("/sla/overview"), { body: ok(overview) }).as("slaOverview")
  })
  cy.fixture("sla/tickets").then((tickets) => {
    cy.intercept("GET", apiPath("/sla/tickets"), { body: ok(tickets, listMeta(tickets.length)) }).as("slaTickets")
  })
  cy.fixture("sla/settings").then((settings) => {
    cy.intercept("GET", apiPath("/sla/settings"), { body: ok(settings) }).as("slaSettings")
    cy.intercept("PUT", apiPath("/sla/settings"), (req) => {
      req.reply({ body: ok({ ...settings, ...req.body, isDefault: false }) })
    }).as("slaSaveSettings")
  })
  cy.interceptApi(
    "GET",
    "/sla/filters",
    {
      body: ok({
        projects: [{ id: "e2e-proj-1", name: "Apollo" }, { id: "e2e-proj-2", name: "Hermes" }],
        companies: [{ id: "e2e-cc-1", name: "Client Co" }],
        assignees: [{ id: "e2e-user-2", name: "Uche Tester" }],
        supporters: [{ id: "e2e-sup-1", name: "Sam Support" }],
      }),
    },
    "slaFilters"
  )
})

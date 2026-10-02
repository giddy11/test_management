import { listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"
const BUG_ID = "e2e-bug-1"
const BUG_URL = `/projects/${PROJECT_ID}/bugs/${BUG_ID}`

// The fixture bug was reported by "user" (e2e-user-0001), so logging in as "user"
// is the reporter; pass a different id to be someone else on the same project.
function openBug(role: "admin" | "user", userOverrides?: Record<string, unknown>) {
  cy.login(role, userOverrides)
  cy.fixture("projects/list").then((projects) => {
    cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
  })
  cy.fixture("bugs/list").then((bugs) => {
    cy.interceptApi("GET", `/bugs/${BUG_ID}`, { body: ok(bugs[0]) }, "bug")
  })
  cy.interceptApi("GET", `/bugs/${BUG_ID}/attachments`, { body: ok([]) }, "attachments")
  cy.interceptApi(
    "GET",
    `/bugs/${BUG_ID}/history`,
    {
      body: ok([
        { status: "Open", enteredAt: "2026-07-14T09:00:00.000Z" },
        { status: "In Progress", enteredAt: "2026-07-14T11:00:00.000Z" },
        { status: "Fixed", enteredAt: "2026-07-15T09:00:00.000Z" },
        { status: "Reopened", enteredAt: "2026-07-16T09:00:00.000Z" },
        { status: "In Progress", enteredAt: "2026-07-16T10:00:00.000Z" },
      ]),
    },
    "history"
  )
  // The manage dialog's assignee picker loads users; the edit dialog's test-case picker loads suites.
  cy.fixture("team/users").then((users) => {
    cy.interceptApi("GET", "/users", { body: ok(users, listMeta(users.length)) }, "users")
  })
  cy.fixture("testmgmt/suites").then((suites) => {
    cy.interceptApi("GET", "/test-suites", { body: ok(suites, listMeta(suites.length)) }, "suites")
  })
  cy.visit(BUG_URL)
  cy.wait("@bug")
}

describe("Bug detail (admin)", () => {
  beforeEach(() => openBug("admin"))

  it("renders the bug report in full", () => {
    cy.contains("h1", "Login button unresponsive on Safari").should("be.visible")
    cy.contains("Open").should("be.visible")
    cy.contains("Major").should("be.visible")
    cy.contains("Reported by Uche Tester").should("be.visible")
    cy.contains("Open the app in Safari").should("be.visible")
    cy.contains("User is signed in").should("be.visible")
    cy.contains("Nothing happens").should("be.visible")
    cy.contains("Safari 17 / macOS").should("be.visible")
  })

  it("shows the status timeline, including a status entered twice after a reopen", () => {
    cy.contains("Status timeline").should("be.visible")
    cy.dataCy("timeline-entry").should("have.length", 5)
    cy.dataCy("timeline-entry").eq(0).should("contain", "Open").and("contain", "2h")
    cy.dataCy("timeline-entry").eq(3).should("contain", "Reopened").and("contain", "1h")
    cy.dataCy("timeline-entry").eq(4).should("contain", "In Progress").and("contain", "so far")
  })

  it("transitions the bug status and assigns a user", () => {
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi(
        "PATCH",
        `/bugs/${BUG_ID}`,
        { body: ok({ ...bugs[0], status: "In Progress", assignedTo: { id: "e2e-user-0002", name: "Bola Runner" } }) },
        "manageBug"
      )
    })

    cy.dataCy("bug-manage").click()
    cy.contains("Manage bug").should("be.visible")
    cy.selectDropdown('[data-cy="bug-status"]', "In Progress")
    cy.dataCy("bug-manage-save").click()

    cy.wait("@manageBug").its("request.body").should("deep.equal", {
      status: "In Progress",
      severity: "Major",
      priority: "High",
      assignedToId: null,
    })
    cy.contains("Bug updated").should("be.visible")
  })

  it("blocks going back — an open bug can't be reopened, later stages are open", () => {
    // The fixture bug is Open.
    cy.dataCy("bug-manage").click()
    cy.dataCy("bug-status").click()

    cy.contains('[role="option"]', "Reopened").should("have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Open").should("not.have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "In Progress").should("not.have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Closed").should("not.have.attr", "aria-disabled", "true")
  })

  it("lets a closed bug be reopened but not moved to an earlier stage", () => {
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("GET", `/bugs/${BUG_ID}`, { body: ok({ ...bugs[0], status: "Closed" }) }, "closedBug")
    })
    cy.visit(BUG_URL)
    cy.wait("@closedBug")

    cy.dataCy("bug-manage").click()
    cy.dataCy("bug-status").click()
    cy.contains('[role="option"]', "Open").should("have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Verified").should("have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Closed").should("not.have.attr", "aria-disabled", "true")
    cy.contains('[role="option"]', "Reopened").should("not.have.attr", "aria-disabled", "true")
  })

  it("edits the report and sends only the content fields", () => {
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi(
        "PATCH",
        `/bugs/${BUG_ID}`,
        { body: ok({ ...bugs[0], title: "Login button unresponsive on Safari 17", environment: null }) },
        "editBug"
      )
    })

    cy.dataCy("bug-edit").click()
    cy.contains("Edit bug").should("be.visible")
    // Prefilled from the bug; severity/priority aren't editable here (they drive SLA targets).
    cy.get("#title").should("have.value", "Login button unresponsive on Safari")
    cy.get("#stepsToReproduceText").should(
      "have.value",
      "Open the app in Safari\nFill the login form\nClick sign in"
    )
    cy.get('[role="dialog"]').within(() => {
      cy.contains("Severity").should("not.exist")
      cy.contains("Priority").should("not.exist")
    })

    cy.get("#title").type(" 17")
    cy.get("#environment").clear()
    cy.dataCy("bug-submit").click()

    cy.wait("@editBug").its("request.body").should("deep.equal", {
      title: "Login button unresponsive on Safari 17",
      description: "Clicking sign-in does nothing on Safari 17.",
      stepsToReproduce: ["Open the app in Safari", "Fill the login form", "Click sign in"],
      expectedBehavior: "User is signed in",
      actualBehavior: "Nothing happens",
      environment: null,
      testCaseId: null,
    })
    cy.contains("Bug updated").should("be.visible")
  })

  describe("once the bug is no longer Open", () => {
    const MOVED_ON: string[] = ["In Progress", "Fixed", "Verified", "Closed"]
    MOVED_ON.forEach((status) => {
      it(`locks editing the report while it is ${status}`, () => {
        cy.fixture("bugs/list").then((bugs) => {
          cy.interceptApi("GET", `/bugs/${BUG_ID}`, { body: ok({ ...bugs[0], status }) }, "movedOnBug")
        })
        cy.visit(BUG_URL)
        cy.wait("@movedOnBug")

        cy.dataCy("bug-edit").should("be.visible").and("be.disabled")
        cy.dataCy("bug-edit-wrapper")
          .should("have.attr", "title")
          .and("contain", `This bug is ${status}`)
          .and("contain", "can no longer be edited")
        // Triage is untouched — the team can still move the bug along.
        cy.dataCy("bug-manage").should("be.visible").and("not.be.disabled")
      })
    })
  })

  it("makes the report editable again when the bug is Reopened", () => {
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("GET", `/bugs/${BUG_ID}`, { body: ok({ ...bugs[0], status: "Reopened" }) }, "reopenedBug")
    })
    cy.visit(BUG_URL)
    cy.wait("@reopenedBug")

    cy.dataCy("bug-edit").should("not.be.disabled")
    cy.dataCy("bug-edit-wrapper").should("not.have.attr", "title")
    cy.dataCy("bug-edit").click()
    cy.contains("Edit bug").should("be.visible")
  })

  it("keeps the edit button enabled while the bug is Open", () => {
    // The fixture bug is Open.
    cy.dataCy("bug-edit").should("not.be.disabled")
    cy.dataCy("bug-edit-wrapper").should("not.have.attr", "title")
  })

  it("deletes the bug and returns to the project", () => {
    cy.interceptApi("DELETE", `/bugs/${BUG_ID}`, { body: ok(null) }, "deleteBug")
    cy.fixture("dashboard/overview").then((overview) => {
      cy.interceptApi("GET", "/dashboard/overview", { body: ok(overview) }, "overview")
    })
    cy.interceptApi("GET", "/test-suites", { body: ok([], listMeta(0)) }, "suites")

    cy.dataCy("bug-delete").click()
    cy.contains("Delete bug").should("be.visible")
    cy.dataCy("confirm-ok").click()

    cy.wait("@deleteBug")
    cy.contains("Bug deleted").should("be.visible")
    cy.location("pathname").should("eq", `/projects/${PROJECT_ID}`)
  })
})

describe("Bug detail (reporter, not a team lead)", () => {
  it("can fix their own report but not triage or delete it", () => {
    openBug("user")
    cy.dataCy("bug-edit").should("be.visible")
    cy.dataCy("bug-manage").should("not.exist")
    cy.dataCy("bug-delete").should("not.exist")
  })

  it("can't edit their own report once the bug has moved on", () => {
    cy.login("user")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.fixture("bugs/list").then((bugs) => {
      cy.interceptApi("GET", `/bugs/${BUG_ID}`, { body: ok({ ...bugs[0], status: "In Progress" }) }, "bug")
    })
    cy.interceptApi("GET", `/bugs/${BUG_ID}/attachments`, { body: ok([]) }, "attachments")
    cy.interceptApi("GET", `/bugs/${BUG_ID}/history`, { body: ok([]) }, "history")
    cy.visit(BUG_URL)
    cy.wait("@bug")

    // The reporter still sees the button — but it no longer works.
    cy.dataCy("bug-edit").should("be.disabled")
  })

  it("can't edit a bug someone else reported", () => {
    openBug("user", { id: "e2e-user-9999", name: "Someone Else" })
    cy.contains("h1", "Login button unresponsive on Safari").should("be.visible")
    cy.dataCy("bug-edit").should("not.exist")
  })
})

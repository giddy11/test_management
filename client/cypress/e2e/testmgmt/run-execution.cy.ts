import { listMeta, ok } from "../../support/api"

const PROJECT_ID = "e2e-proj-1"
const RUN_ID = "e2e-run-1"

describe("Run execution", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.fixture("projects/list").then((projects) => {
      cy.interceptApi("GET", `/projects/${PROJECT_ID}`, { body: ok({ ...projects[0], members: [] }) }, "project")
    })
    cy.fixture("testmgmt/run").then((run) => {
      cy.interceptApi("GET", `/test-runs/${RUN_ID}`, { body: ok(run) }, "run")
    })
    cy.fixture("testmgmt/results").then((results) => {
      cy.interceptApi("GET", "/test-run-results", { body: ok(results, listMeta(results.length)) }, "results")
    })
    cy.visit(`/projects/${PROJECT_ID}/runs/${RUN_ID}`)
    cy.wait(["@run", "@results"])
  })

  it("shows the run header, summary, and result rows", () => {
    cy.contains("h1", "Release 1.4 run").should("be.visible")
    cy.contains("In progress").should("be.visible")
    cy.contains("Results — 0/2 passed").should("be.visible")
    cy.contains("Valid login").should("be.visible")
    cy.contains("Invalid login shows error").should("be.visible")
  })

  it("records a pass result on a single case", () => {
    cy.interceptApi(
      "PATCH",
      "/test-run-results/e2e-result-1",
      { body: ok({ id: "e2e-result-1", status: "pass" }) },
      "recordResult"
    )

    cy.contains('[data-cy="result-row"]', "Valid login").within(() => {
      cy.dataCy("result-pass").click()
    })

    cy.wait("@recordResult").its("request.body").should("deep.equal", { status: "pass" })
  })

  it("bulk-marks selected cases through the toolbar", () => {
    cy.interceptApi("PATCH", "/test-run-results/bulk", { body: ok(null) }, "bulkRecord")

    cy.contains("Select all").should("be.visible")
    cy.get('[aria-label="Select all results"]').click()
    cy.contains("2 selected").should("be.visible")
    cy.contains("button", "Pass all").click()

    cy.wait("@bulkRecord").its("request.body").should("deep.equal", {
      runId: RUN_ID,
      ids: ["e2e-result-1", "e2e-result-2"],
      status: "pass",
    })
    cy.contains("Marked 2 as Pass").should("be.visible")
  })

  it("marks the run completed and locks result recording", () => {
    cy.fixture("testmgmt/run").then((run) => {
      cy.interceptApi(
        "PATCH",
        `/test-runs/${RUN_ID}`,
        { body: ok({ ...run, status: "completed" }) },
        "updateRun"
      )
      // The page refetches the run after the mutation — serve the completed state.
      cy.interceptApi("GET", `/test-runs/${RUN_ID}`, { body: ok({ ...run, status: "completed" }) }, "runCompleted")
    })

    cy.dataCy("run-complete").click()

    cy.wait("@updateRun").its("request.body").should("deep.equal", { status: "completed" })
    cy.contains("Run completed").should("be.visible")
    cy.contains("This run is completed.").should("be.visible")
    cy.dataCy("result-pass").should("be.disabled")
  })
})

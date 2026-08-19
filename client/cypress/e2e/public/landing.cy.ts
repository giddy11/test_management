// The marketing home page at "/" — public, no API calls, no login.
const SECTION_HEADINGS = [
  "hero-heading",
  "who-its-for-heading",
  "features-heading",
  "how-it-works-heading",
  "product-heading",
  "benefits-heading",
  "faq-heading",
  "cta-heading",
]

describe("Landing page", () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.visit("/")
  })

  it("renders every section for a visitor with no account", () => {
    cy.dataCy("landing-page").should("exist")
    cy.get("h1").should("contain.text", "Plan your testing")
    cy.dataCy("hero-primary-cta").should("have.attr", "href", "/register")
    cy.dataCy("hero-secondary-cta").should("have.attr", "href", "/docs")
    cy.dataCy("landing-header-cta").should("have.attr", "href", "/register")

    SECTION_HEADINGS.forEach((id) => cy.get(`#${id}`).should("exist"))
    cy.get("section[aria-labelledby]").should("have.length", SECTION_HEADINGS.length)

    // The product shots are real assets, so a rename must fail the build here.
    cy.get("main img").should("have.length.greaterThan", 0)
    cy.get("main img").each(($img) => {
      expect($img[0].naturalWidth, `${$img.attr("alt")} loaded`).to.be.greaterThan(0)
    })
  })

  it("sends a signed-in user to their own home instead", () => {
    cy.login("admin")
    cy.stubDashboard()
    cy.visit("/")
    cy.location("pathname").should("eq", "/dashboard")
  })

  it("switches product tour tabs", () => {
    cy.get("#product").scrollIntoView()
    cy.contains("[role=tab]", "Dashboard").should("have.attr", "data-state", "active")
    cy.contains("[role=tab]", "Bugs").click()
    cy.contains("[role=tab]", "Bugs").should("have.attr", "data-state", "active")
    cy.get("[role=tabpanel]:visible").should("contain.text", "Severity and priority")
  })

  it("opens an FAQ answer", () => {
    cy.dataCy("landing-faq").scrollIntoView()
    cy.dataCy("landing-faq").find("button").first().as("question")
    cy.get("@question").should("have.attr", "aria-expanded", "false")
    cy.get("@question").click()
    cy.get("@question").should("have.attr", "aria-expanded", "true")
    cy.dataCy("landing-faq").should("contain.text", "Admins create accounts from the Team page")
  })

  it("collapses into a mobile menu and never scrolls sideways", () => {
    cy.viewport(390, 844)
    cy.dataCy("landing-menu").should("be.visible").click()
    cy.contains("[role=dialog] a", "How it works").should("be.visible").click()
    cy.get("[role=dialog]").should("not.exist")

    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(
        doc.documentElement.clientWidth + 1,
      )
    })
  })
})

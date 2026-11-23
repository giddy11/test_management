import { ok } from "../../support/api"

// The marketing home page at "/" — public, no login. Its only API call is the
// pricing section, stubbed here like every other call.
const SECTION_HEADINGS = [
  "hero-heading",
  "problem-heading",
  "solution-heading",
  "features-heading",
  "how-it-works-heading",
  "product-heading",
  "benefits-heading",
  "security-heading",
  "pricing-heading",
  "faq-heading",
  "cta-heading",
]

describe("Landing page", () => {
  beforeEach(() => {
    cy.clearLocalStorage()
    cy.fixture("pricing/public").then((pricing) => {
      cy.interceptApi("GET", "/public/pricing", { body: ok(pricing) }, "pricing")
    })
    cy.visit("/")
  })

  it("renders every section for a visitor with no account", () => {
    cy.dataCy("landing-page").should("exist")
    cy.get("h1").should("contain.text", "Higher-quality software")
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

  it("links to the ticket-tracking page from its FAQ answer", () => {
    cy.dataCy("landing-faq").scrollIntoView()
    cy.dataCy("landing-faq").contains("button", "check on it").click()

    cy.dataCy("landing-faq")
      .find('a[href="/my-tickets"]')
      .should("be.visible")
      // A relative route, so it keeps working on any domain.
      .and("not.contain.text", "http")
      .click()

    cy.location("pathname").should("eq", "/my-tickets")
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
  it("shows the plans and switches between monthly and yearly prices", () => {
    cy.wait("@pricing")
    cy.dataCy("landing-pricing").scrollIntoView()
    cy.dataCy("pricing-plan-standard").should("contain.text", "$9").and("contain.text", "/ month")
    cy.dataCy("pricing-plan-free").should("contain.text", "forever")

    cy.dataCy("pricing-billing-toggle").contains("[role=radio]", "Yearly").click()
    cy.dataCy("pricing-plan-standard").should("contain.text", "$90").and("contain.text", "/ year")
    cy.dataCy("pricing-plan-standard").find(`a[href="/register"]`).should("exist")
    cy.get(`header a[href="#pricing"]`).should("exist")
  })

  it("leaves out a plan the platform owner has switched off", () => {
    cy.fixture("pricing/public").then((pricing) => {
      const plans = pricing.plans.map((p: { id: string }) => (p.id === "free" ? { ...p, isVisible: false } : p))
      cy.interceptApi("GET", "/public/pricing", { body: ok({ ...pricing, plans }) }, "oneHidden")
    })
    cy.visit("/")
    cy.wait("@oneHidden")
    cy.dataCy("landing-pricing").scrollIntoView()
    cy.dataCy("pricing-plan-free").should("not.exist")
    cy.dataCy("pricing-plan-standard").should("exist")
    cy.dataCy("pricing-plan-enterprise").should("exist")
  })

  it("leaves pricing out when every plan is switched off", () => {
    cy.fixture("pricing/public").then((pricing) => {
      const plans = pricing.plans.map((p: object) => ({ ...p, isVisible: false }))
      cy.interceptApi("GET", "/public/pricing", { body: ok({ ...pricing, plans }) }, "allHidden")
    })
    cy.visit("/")
    cy.wait("@allHidden")
    cy.dataCy("landing-faq").should("exist")
    cy.dataCy("landing-pricing").should("not.exist")
    cy.get(`header a[href="#pricing"]`).should("not.exist")
  })

  it("leaves pricing out when the platform owner hides it", () => {
    cy.fixture("pricing/public").then((pricing) => {
      cy.interceptApi("GET", "/public/pricing", { body: ok({ ...pricing, isVisible: false }) }, "hiddenPricing")
    })
    cy.visit("/")
    cy.wait("@hiddenPricing")
    cy.dataCy("landing-faq").should("exist")
    cy.dataCy("landing-pricing").should("not.exist")
    cy.get(`header a[href="#pricing"]`).should("not.exist")
  })
})

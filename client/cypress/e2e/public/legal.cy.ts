// The Privacy Policy and Terms & Conditions pages — public, no API calls.
// Section counts are asserted for self-consistency (every section has a
// contents entry) rather than pinned to a number, so adding a clause to a
// document does not fail this spec.
const MIN_SECTIONS = 10

const PAGES = [
  {
    path: "/privacy",
    heading: "Privacy Policy",
    firstSection: "who-we-are",
    counterpart: "/terms",
  },
  {
    path: "/terms",
    heading: "Terms & Conditions",
    firstSection: "agreement",
    counterpart: "/privacy",
  },
]

describe("Legal pages", () => {
  PAGES.forEach((page) => {
    describe(page.path, () => {
      beforeEach(() => cy.visit(page.path))

      it("renders the document with a numbered contents list", () => {
        cy.dataCy("legal-page").should("exist")
        cy.get("h1").should("contain.text", page.heading)
        cy.contains("Last updated").should("be.visible")

        cy.get("main h2").should("have.length.at.least", MIN_SECTIONS)
        cy.get("main h2").then(($headings) => {
          cy.get('nav[aria-label="Sections"] a').should("have.length", $headings.length)
        })
      })

      it("links to its counterpart", () => {
        cy.get(`main a[href="${page.counterpart}"]`).should("exist")
      })

      it("honours a deep link to a section", () => {
        cy.visit(`${page.path}#${page.firstSection}`)
        cy.get(`#${page.firstSection}`).should("be.visible")
        cy.window().its("scrollY").should("be.greaterThan", 0)
      })

      it("never scrolls sideways on a phone", () => {
        cy.viewport(390, 844)
        cy.visit(page.path)
        cy.document().then((doc) => {
          expect(doc.documentElement.scrollWidth).to.be.at.most(
            doc.documentElement.clientWidth + 1,
          )
        })
      })
    })
  })

  it("is reachable from the landing footer", () => {
    cy.visit("/")
    cy.get('footer a[href="/privacy"]').should("exist")
    cy.get('footer a[href="/terms"]').should("exist")
  })

  // The footer links are at the bottom of a long page, so without scroll
  // restoration the new route opens mid-document.
  PAGES.forEach((page) => {
    it(`opens at the top when reached from the footer (${page.path})`, () => {
      cy.visit("/")
      cy.scrollTo("bottom")
      cy.window().its("scrollY").should("be.greaterThan", 0)

      cy.get(`footer a[href="${page.path}"]`).first().click()
      cy.location("pathname").should("eq", page.path)
      cy.window().its("scrollY").should("eq", 0)
      cy.get("h1").should("contain.text", page.heading).and("be.visible")
    })
  })

  it("still lands on the anchor for a hash link from the footer", () => {
    cy.visit("/")
    cy.scrollTo("bottom")
    cy.get('footer a[href="/privacy#sharing"]').first().click()
    cy.location("pathname").should("eq", "/privacy")
    cy.get("#sharing").should("be.visible")
    cy.window().its("scrollY").should("be.greaterThan", 0)
  })

  // Both legal pages and the docs page share useScrollSpy — guard the docs
  // page against a regression in the extraction.
  it("leaves the docs contents nav working", () => {
    cy.visit("/docs")
    cy.get('a[href="#getting-started"]').first().click()
    cy.get("#getting-started").should("be.visible")
    cy.window().its("scrollY").should("be.greaterThan", 0)
  })
})

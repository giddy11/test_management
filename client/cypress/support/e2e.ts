// cypress/support/e2e.ts — loaded before every spec.
import "./commands"

// Recharts (dashboard charts) can trip the benign "ResizeObserver loop"
// browser error; it is not an application failure.
Cypress.on("uncaught:exception", (err) => {
  if (err.message.includes("ResizeObserver loop")) return false
  return undefined
})

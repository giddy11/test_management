import { defineConfig } from "cypress"

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    fixturesFolder: "cypress/fixtures",
    viewportWidth: 1366,
    viewportHeight: 850,
    // Videos only on CI — keeps local runs fast. Screenshots always on failure.
    video: false,
    screenshotOnRunFailure: true,
    // Overwrite old screenshots/videos instead of moving them to the Recycle
    // Bin — Cypress's bundled windows-trash.exe errors on some Windows setups.
    trashAssetsBeforeRuns: false,
    retries: { runMode: 2, openMode: 0 },
    env: {
      // Where the app under test sends API calls. In the default (stubbed)
      // mode this is the dead port from .env.e2e — every request must be
      // intercepted with cy.intercept(); anything unstubbed fails fast
      // instead of reaching the shared dev/prod database.
      apiUrl: "http://127.0.0.1:4545",
    },
    setupNodeEvents(_on, config) {
      if (process.env.CI) config.video = true
      return config
    },
  },
})

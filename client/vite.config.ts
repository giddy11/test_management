import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app + offline app shell. Only the built files are cached —
    // API calls always go to the network, so nothing a user is allowed to see
    // is ever served stale from the cache. The service worker is build-only
    // (no devOptions), so `npm run dev` and the Cypress suite run without one.
    VitePWA({
      // A new deploy waits for the user to choose "Reload" (PwaUpdatePrompt)
      // rather than swapping code under a half-filled form.
      registerType: "prompt",
      injectRegister: false,
      // Icons are generated from pwa-assets.config.ts. Their <link> tags and the
      // theme-color are written in index.html instead: the tab keeps the
      // unpadded favicon.svg, and there is a light and a dark theme-color.
      pwaAssets: { config: true, includeHtmlHeadLinks: false, injectThemeColor: false },
      manifest: {
        id: "/",
        name: "TestMate",
        short_name: "TestMate",
        description: "Test case management — suites, runs, bugs, feature requests and support tickets in one place.",
        start_url: "/dashboard",
        scope: "/",
        display: "standalone",
        theme_color: "#ffffff",
        background_color: "#ffffff",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // The ~8 MB city list (see src/hooks/useCities.ts) is only needed by the
        // address fields in Settings and Register, so it isn't part of every
        // install — it is cached the first time one of those forms loads it.
        globIgnores: ["**/assets/city-*.js"],
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, url }) => sameOrigin && /^\/assets\/city-[^/]+\.js$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "city-data",
              // The file name is content-hashed: keep only the current one.
              expiration: { maxEntries: 1 },
            },
          },
        ],
        // Workbox's default 2 MB cap, with headroom for the biggest page chunks.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Client-side routes all fall back to index.html offline — except the
        // API and Firebase's reserved paths, which must reach the network.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})

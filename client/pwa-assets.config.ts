import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config"

// Generates the install icons (pwa-*.png, maskable, apple-touch, favicon.ico)
// at build time — see `pwaAssets` in vite.config.ts. The source is the product
// mark from public/favicon.svg, centred on a square canvas (public/pwa-icon.svg)
// so the mark is never cropped; that canvas already leaves a margin, so the
// paddings below are smaller than the preset's. Maskable keeps enough padding
// for the mark to sit inside the circular safe zone. Maskable and Apple icons
// need an opaque background: white, so the violet mark looks as it does elsewhere.
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0.25, resizeOptions: { background: "#ffffff" } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background: "#ffffff" } },
  },
  images: ["public/pwa-icon.svg"],
})

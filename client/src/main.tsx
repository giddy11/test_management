import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { GoogleOAuthProvider } from "@react-oauth/google"
import "./index.css"
import App from "./App.tsx"
import { queryClient } from "@/lib/queryClient"
import { Toaster } from "@/components/ui/sonner"
import { PwaUpdatePrompt } from "@/components/pwa/PwaUpdatePrompt"
import { ThemeProvider } from "@/contexts/ThemeContext"

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""

// /widget/* is the embeddable contact widget: it only ever renders inside a tiny
// (64px launcher) iframe on someone else's site, where the "new version, Reload"
// toast would spill out as a few wrapped letters over the launcher. Nothing
// reloads the iframe by itself (so a half-filled ticket form is safe); the widget
// just picks up the new version the next time the host page loads it.
const IS_EMBEDDED_WIDGET = window.location.pathname.startsWith("/widget/")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <QueryClientProvider client={queryClient}>
          <App />
          <Toaster richColors position="top-right" />
          {!IS_EMBEDDED_WIDGET && <PwaUpdatePrompt />}
        </QueryClientProvider>
      </GoogleOAuthProvider>
    </ThemeProvider>
  </StrictMode>,
)

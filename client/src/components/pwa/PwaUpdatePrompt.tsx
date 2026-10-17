// components/pwa/PwaUpdatePrompt.tsx — registers the service worker and, when a
// new deploy has been downloaded, offers to reload into it. The new version
// never takes over by itself, so nobody loses a half-filled form to an update.
// Renders nothing.
import { useEffect } from "react"
import { toast } from "sonner"
import { useRegisterSW } from "virtual:pwa-register/react"

// Long-lived tabs (and the installed app, which is rarely reloaded) would
// otherwise only notice a deploy on their next full page load.
const UPDATE_CHECK_MS = 60 * 60 * 1000

const UPDATE_TOAST_ID = "pwa-update"

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      setInterval(async () => {
        // Skip while offline or mid-install; the next tick tries again.
        if (registration.installing || !navigator.onLine) return
        try {
          const res = await fetch(swUrl, { cache: "no-store", headers: { "cache-control": "no-cache" } })
          if (res.status === 200) await registration.update()
        } catch {
          // Network blip — not worth surfacing.
        }
      }, UPDATE_CHECK_MS)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast("A new version of TestMate is available", {
      id: UPDATE_TOAST_ID,
      description: "Reload to get the latest changes.",
      duration: Infinity,
      action: { label: "Reload", onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}

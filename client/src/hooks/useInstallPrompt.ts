// hooks/useInstallPrompt.ts — "Install app" for browsers that support it
// (Chrome, Edge, Android). The browser fires beforeinstallprompt once it deems
// the app installable; we hold on to that event so a menu item can show the
// install dialog later. Safari has no such event: there the item never shows,
// and people use Share → Add to Home Screen instead.
import { useSyncExternalStore } from "react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

// Module-level, not per component: the event can fire before anything that
// shows the menu item has mounted (e.g. while still on the sign-in page).
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Stop the browser's own mini-infobar; the menu item offers it instead.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    notify()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInstallPrompt() {
  const event = useSyncExternalStore(subscribe, () => deferred, () => null)

  const install = async () => {
    if (!deferred) return
    const prompt = deferred
    // The event can only be used once, whatever the person picks.
    deferred = null
    notify()
    await prompt.prompt()
    await prompt.userChoice
  }

  return { canInstall: event !== null, install }
}

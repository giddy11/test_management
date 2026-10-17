// components/pwa/InstallAppButton.tsx — a pill in the header, in the style of
// Chrome's own "Open in app" chip, so people notice TestMate can be installed.
// Only rendered once the browser says it can install the app (see
// useInstallPrompt) — so never in Safari, and never once it is installed.
import { cn } from "@/lib/utils"
import { useInstallPrompt } from "@/hooks/useInstallPrompt"

export function InstallAppButton({ className }: { className?: string }) {
  const { canInstall, install } = useInstallPrompt()
  if (!canInstall) return null

  return (
    <button
      type="button"
      onClick={() => void install()}
      title="Install TestMate as an app on this device"
      data-cy="install-app-pill"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-brand-strong py-1 pr-3.5 pl-1 text-sm font-medium text-brand-foreground shadow-sm shadow-brand/25 transition-colors hover:bg-brand focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:outline-none",
        className
      )}
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-white">
        <img src="/favicon.svg" alt="" className="size-3.5" />
      </span>
      <span className="sm:hidden">Install</span>
      <span className="hidden sm:inline">Install app</span>
    </button>
  )
}

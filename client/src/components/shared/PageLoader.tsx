import { cn } from "@/lib/utils"

// A centered, branded loading indicator for pages and sections.
export function PageLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn("flex min-h-[45vh] flex-col items-center justify-center gap-4", className)}
      role="status"
      aria-live="polite"
      data-cy="page-loader"
    >
      <div className="relative size-10">
        <div className="absolute inset-0 rounded-full border-[3px] border-muted" />
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-primary" />
      </div>
      <span className="text-sm text-muted-foreground">{label ?? "Loading"}…</span>
    </div>
  )
}

// Compact inline variant (e.g. inside a table cell or dropdown).
export function InlineLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 text-muted-foreground", className)} role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <span className="text-sm">{label}…</span>
    </div>
  )
}

// components/landing/Wordmark.tsx — the TestMate lockup, matching the mark used
// in the app sidebar and the docs header.
import { Link } from "react-router-dom"
import { FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"

interface WordmarkProps {
  /** Optional line under the name, e.g. the page this header belongs to. */
  tagline?: string
  className?: string
}

export function Wordmark({ tagline, className }: WordmarkProps) {
  return (
    <Link
      to="/"
      className={cn(
        "flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-linear-to-br from-brand-strong via-brand to-brand-accent text-brand-foreground shadow-sm shadow-brand/30">
        <FlaskConical className="size-4" aria-hidden />
      </div>
      <span className="leading-tight">
        <span className="block text-base font-semibold">
          Test<span className="text-brand">Mate</span>
        </span>
        {tagline && (
          <span className="hidden text-xs text-muted-foreground sm:block">
            {tagline}
          </span>
        )}
      </span>
    </Link>
  )
}

import { RESULT_META } from "@/lib/enums"
import { cn } from "@/lib/utils"
import type { RunSummary } from "@/types/testMgmt.types"

const ORDER = ["pass", "fail", "blocked", "skipped", "pending"] as const

const countOf = (summary: RunSummary, key: (typeof ORDER)[number]) =>
  (summary as unknown as Record<string, number | undefined>)[key] ?? 0

// Horizontal stacked proportion bar for a run's results. `compact` drops the
// legend to a single pass-count line so the bar fits inside a table cell — the
// full breakdown moves to the hover title.
export function SummaryBar({ summary, compact = false }: { summary: RunSummary; compact?: boolean }) {
  const total = summary.total || 0
  const segments = ORDER.map((k) => ({ key: k, value: countOf(summary, k) })).filter((s) => s.value > 0)
  const breakdown = ORDER.map((k) => `${RESULT_META[k].label} ${countOf(summary, k)}`).join(" · ")

  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")} title={compact ? breakdown : undefined}>
      <div className={cn("flex w-full overflow-hidden rounded-full bg-muted", compact ? "h-1.5" : "h-2")}>
        {total > 0 &&
          segments.map((s) => (
            <div
              key={s.key}
              style={{ width: `${(s.value / total) * 100}%`, backgroundColor: RESULT_META[s.key].color }}
            />
          ))}
      </div>
      {compact ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {countOf(summary, "pass")}/{total} passed
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {ORDER.map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: RESULT_META[k].color }} />
              {RESULT_META[k].label} {countOf(summary, k)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

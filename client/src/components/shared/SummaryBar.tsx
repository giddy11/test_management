import { RESULT_META } from "@/lib/enums"
import type { RunSummary } from "@/types/testMgmt.types"

const ORDER = ["pass", "fail", "blocked", "skipped", "pending"] as const

// Horizontal stacked proportion bar for a run's results.
export function SummaryBar({ summary }: { summary: RunSummary }) {
  const total = summary.total || 0
  const segments = ORDER.map((k) => ({
    key: k,
    value: (summary as unknown as Record<string, number | undefined>)[k] ?? 0,
  })).filter((s) => s.value > 0)

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          segments.map((s) => (
            <div
              key={s.key}
              style={{ width: `${(s.value / total) * 100}%`, backgroundColor: RESULT_META[s.key].color }}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {ORDER.map((k) => {
          const v = (summary as unknown as Record<string, number | undefined>)[k] ?? 0
          return (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: RESULT_META[k].color }} />
              {RESULT_META[k].label} {v}
            </span>
          )
        })}
      </div>
    </div>
  )
}

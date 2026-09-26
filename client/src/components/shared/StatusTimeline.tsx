// Vertical timeline of the statuses an item has been through, built from the
// API's ordered status-entry history (one entry per status actually entered —
// stages that were skipped simply don't appear, and a status can repeat, e.g.
// a reopened bug). Time in each status is the gap to the next entry; the last
// one is still running.
import { useMemo } from "react"
import { CheckCircle2, Clock } from "lucide-react"
import { formatDuration } from "@/lib/formatDuration"

export interface StatusTimelineEntry {
  status: string
  enteredAt: string
}

interface Props {
  // Oldest first.
  history: StatusTimelineEntry[]
  labelFor: (status: string) => string
  // Statuses where the item is finished for now — as the current row they show
  // no running clock, since "Done — 3 weeks so far" says nothing useful.
  finalStatuses?: readonly string[]
}

export function StatusTimeline({ history, labelFor, finalStatuses = [] }: Props) {
  const rows = useMemo(() => {
    const now = Date.now()
    return history.map((entry, i) => {
      const next = history[i + 1]
      const isCurrent = !next
      const end = next ? new Date(next.enteredAt).getTime() : now
      const durationMs = end - new Date(entry.enteredAt).getTime()
      const showDuration = !isCurrent || !finalStatuses.includes(entry.status)
      return { ...entry, isCurrent, durationMs: showDuration ? durationMs : null }
    })
  }, [history, finalStatuses])

  return (
    <ol className="space-y-0" data-cy="status-timeline">
      {rows.map((row, i) => (
        <li
          key={`${row.status}-${row.enteredAt}`}
          className="relative flex gap-3 pb-4 last:pb-0"
          data-cy="timeline-entry"
        >
          {i < rows.length - 1 && <span className="absolute left-2.25 top-5 h-full w-px bg-primary/40" />}
          <span className="mt-0.5 shrink-0">
            {row.isCurrent ? (
              <Clock className="size-4.5 text-primary" />
            ) : (
              <CheckCircle2 className="size-4.5 text-primary" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-sm font-medium">{labelFor(row.status)}</span>
              <p className="text-xs text-muted-foreground">
                {new Date(row.enteredAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
            {row.durationMs !== null && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.isCurrent ? `${formatDuration(row.durationMs)} so far` : formatDuration(row.durationMs)}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

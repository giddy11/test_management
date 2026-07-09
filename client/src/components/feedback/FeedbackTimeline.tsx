// Vertical stepper showing how long a feedback item spent in each lifecycle
// stage — derived client-side from the ordered stage-entry timestamps the
// API returns (one entry per stage actually reached; the workflow is
// strictly sequential, so there are no gaps to reconcile).
import { useMemo } from "react"
import { CheckCircle2, Circle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/formatDuration"
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackStatus,
  type FeedbackStatusHistoryEntry,
} from "@/types/feedback.types"

interface StageRow {
  status: FeedbackStatus
  reached: boolean
  isCurrent: boolean
  enteredAt: string | null
  durationMs: number | null // time spent in this stage; null while pending or unreached
}

function buildRows(history: FeedbackStatusHistoryEntry[]): StageRow[] {
  const now = Date.now()
  return FEEDBACK_STATUSES.map((status) => {
    // A stage can be skipped (e.g. assigning while "logged" jumps straight to
    // "assigned"), so a reached stage's position in `history` may not match
    // its position in FEEDBACK_STATUSES — look it up by its own index.
    const idx = history.findIndex((h) => h.status === status)
    if (idx === -1) return { status, reached: false, isCurrent: false, enteredAt: null, durationMs: null }

    const entry = history[idx]
    const next = history[idx + 1]
    const isCurrent = idx === history.length - 1
    const end = next ? new Date(next.enteredAt).getTime() : now
    const durationMs = end - new Date(entry.enteredAt).getTime()
    return { status, reached: true, isCurrent, enteredAt: entry.enteredAt, durationMs }
  })
}

export function FeedbackTimeline({ history }: { history: FeedbackStatusHistoryEntry[] }) {
  const rows = useMemo(() => buildRows(history), [history])

  return (
    <ol className="space-y-0">
      {rows.map((row, i) => (
        <li key={row.status} className="relative flex gap-3 pb-4 last:pb-0">
          {i < rows.length - 1 && (
            <span
              className={cn(
                "absolute left-2.25 top-5 h-full w-px",
                row.reached ? "bg-primary/40" : "bg-border"
              )}
            />
          )}
          <span className="mt-0.5 shrink-0">
            {row.isCurrent ? (
              <Clock className="size-4.5 text-primary" />
            ) : row.reached ? (
              <CheckCircle2 className="size-4.5 text-primary" />
            ) : (
              <Circle className="size-4.5 text-muted-foreground/40" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                !row.reached && "text-muted-foreground"
              )}
            >
              {FEEDBACK_STATUS_LABELS[row.status]}
            </span>
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

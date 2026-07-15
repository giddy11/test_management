// Vertical stepper showing how long a feedback item spent in each lifecycle
// stage — derived client-side from the ordered stage-entry timestamps the
// API returns (one entry per stage actually reached; the workflow is
// strictly sequential, so there are no gaps to reconcile).
import { useMemo } from "react"
import { CheckCircle2, Circle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/formatDuration"
import { FEEDBACK_STATUSES, FEEDBACK_STATUS_LABELS } from "@/types/feedback.types"

// Works for both tiers — product statuses by default, support statuses via props.
interface TimelineEntry {
  status: string
  enteredAt: string
}

interface StageRow {
  status: string
  reached: boolean
  isCurrent: boolean
  enteredAt: string | null
  durationMs: number | null // time spent in this stage; null while pending or unreached
}

// "resolved" and "escalated" are mutually exclusive terminal outcomes (the
// support tier's timeline lists both as possible next steps) — once one is
// reached, the other will never happen and shouldn't linger as a pending step.
const TERMINAL_ALTERNATIVES = ["resolved", "escalated"]

function buildRows(history: TimelineEntry[], stages: string[]): StageRow[] {
  const now = Date.now()
  const rows = stages.map((status) => {
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

  const reachedTerminal = rows.find((r) => TERMINAL_ALTERNATIVES.includes(r.status) && r.reached)
  if (!reachedTerminal) return rows
  return rows.filter((r) => r.status === reachedTerminal.status || !TERMINAL_ALTERNATIVES.includes(r.status))
}

// Defaults render the product-team lifecycle; the support portal passes the
// IT-tier stages/labels instead.
export function FeedbackTimeline({
  history,
  stages = FEEDBACK_STATUSES,
  labels = FEEDBACK_STATUS_LABELS,
}: {
  history: TimelineEntry[]
  stages?: string[]
  labels?: Record<string, string>
}) {
  const rows = useMemo(() => buildRows(history, stages), [history, stages])

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
          <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
            <div className="min-w-0">
              <span
                className={cn(
                  "text-sm font-medium",
                  !row.reached && "text-muted-foreground"
                )}
              >
                {labels[row.status] ?? row.status}
              </span>
              {row.enteredAt && (
                <p className="text-xs text-muted-foreground">
                  {new Date(row.enteredAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
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

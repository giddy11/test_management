import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ResultBadge } from "@/components/shared/StatusBadge"
import { cn } from "@/lib/utils"
import { RESULT_STATUSES, RESULT_META, type ResultStatus } from "@/lib/enums"
import { useRecordResult } from "@/hooks/useRuns"
import { ApiError } from "@/transport/http"
import type { TestRunResult } from "@/types/testMgmt.types"

interface Props {
  runId: string
  result: TestRunResult
  caseTitle: string
  disabled?: boolean
}

export function ResultRow({ runId, result, caseTitle, disabled }: Props) {
  const record = useRecordResult(runId)
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState(result.notes ?? "")

  const setStatus = (status: ResultStatus) => {
    record.mutate(
      { id: result.id, payload: { status } },
      { onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed") }
    )
  }

  const saveNotes = () => {
    record.mutate(
      { id: result.id, payload: { notes: notes || null } },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => { toast.success("Note saved"); setOpen(false) },
      }
    )
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ResultBadge value={result.status} />
          <span className="text-sm font-medium">{caseTitle}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RESULT_STATUSES.map((s) => {
            const active = result.status === s
            return (
              <Button
                key={s}
                size="sm"
                variant="outline"
                disabled={disabled || record.isPending}
                onClick={() => setStatus(s)}
                className={cn("h-7", active && "border-transparent text-white")}
                style={active ? { backgroundColor: RESULT_META[s].color } : undefined}
              >
                {RESULT_META[s].label}
              </Button>
            )
          })}
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpen((o) => !o)}>
            {result.notes ? "Note ✓" : "Note"}
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-2">
          <Textarea
            rows={2}
            placeholder="Notes / actual result…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={saveNotes} disabled={record.isPending}>Save note</Button>
          </div>
        </div>
      )}
    </div>
  )
}

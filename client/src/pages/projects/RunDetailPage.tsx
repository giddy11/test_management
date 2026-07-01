import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ChevronLeft, CheckCircle2, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { ResultRow } from "@/components/testmgmt/ResultRow"
import { PageLoader } from "@/components/shared/PageLoader"
import { useRun, useResults, useUpdateRun, useBulkRecordResults } from "@/hooks/useRuns"
import { RESULT_STATUSES, RESULT_META, type ResultStatus } from "@/lib/enums"
import { cn } from "@/lib/utils"
import { ApiError } from "@/transport/http"

export default function RunDetailPage() {
  const { projectId = "", runId = "" } = useParams()
  const { data: run, isLoading } = useRun(runId)
  const [page, setPage] = useState(1)
  const { data: runResults } = useResults(runId, page)
  const results = runResults?.data ?? []
  const meta = runResults?.meta
  const updateRun = useUpdateRun()
  const bulkRecord = useBulkRecordResults(runId)

  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Clear selection when navigating pages
  useEffect(() => { setSelected(new Set()) }, [page])

  const allSelected = results.length > 0 && results.every((r) => selected.has(r.id))
  const someSelected = selected.size > 0

  const toggleAll = () =>
    setSelected(() => {
      if (allSelected) return new Set()
      return new Set(results.map((r) => r.id))
    })

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const applyBulkStatus = (status: ResultStatus | null) => {
    bulkRecord.mutate(
      { ids: [...selected], status },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => {
          toast.success(
            status
              ? `Marked ${selected.size} as ${RESULT_META[status].label}`
              : `Cleared ${selected.size} result${selected.size === 1 ? "" : "s"}`
          )
          setSelected(new Set())
        },
      }
    )
  }

  if (isLoading) return <PageLoader />
  if (!run) return <p className="text-sm text-destructive">Run not found.</p>

  const completed = run.status === "completed"
  const toggleStatus = () =>
    updateRun.mutate(
      { id: run.id, payload: { status: completed ? "in_progress" : "completed" } },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => toast.success(completed ? "Run reopened" : "Run completed"),
      }
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={`/projects/${projectId}`} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> Back to project
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{run.name}</h1>
            <Badge variant={completed ? "default" : "secondary"}>
              {completed ? "Completed" : "In progress"}
            </Badge>
          </div>
        </div>
        <Button variant={completed ? "outline" : "default"} onClick={toggleStatus} disabled={updateRun.isPending}>
          {completed ? <><RotateCcw className="mr-1 size-4" /> Reopen</> : <><CheckCircle2 className="mr-1 size-4" /> Mark completed</>}
        </Button>
      </div>

      {run.summary?.total ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Results — {run.summary.pass ?? 0}/{run.summary.total} passed
            </CardTitle>
          </CardHeader>
          <CardContent><SummaryBar summary={run.summary} /></CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        {results.length === 0 && (
          <p className="text-sm text-muted-foreground">No test cases assigned to you in this run.</p>
        )}

        {results.length > 0 && (
          <>
            {/* Select-all row + bulk action toolbar */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all results"
              />
              <span className="text-sm text-muted-foreground">
                {someSelected ? `${selected.size} selected` : "Select all"}
              </span>

              {someSelected && (
                <>
                  <div className="mx-1 h-4 w-px bg-border" />
                  {RESULT_STATUSES.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      disabled={bulkRecord.isPending}
                      onClick={() => applyBulkStatus(s)}
                      className={cn("h-7 text-xs")}
                      style={{ borderColor: RESULT_META[s].color, color: RESULT_META[s].color }}
                    >
                      {RESULT_META[s].label} all
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={bulkRecord.isPending}
                    onClick={() => applyBulkStatus(null)}
                    className="h-7 text-xs text-muted-foreground"
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelected(new Set())}
                    className="ml-auto h-7 px-2"
                    aria-label="Deselect all"
                  >
                    <X className="size-3.5" />
                  </Button>
                </>
              )}
            </div>

            {results.map((r) => (
              <ResultRow
                key={r.id}
                runId={runId}
                result={r}
                caseTitle={r.caseTitle ?? r.testCaseId}
                projectId={projectId}
                suiteId={run.suiteId}
                selected={selected.has(r.id)}
                onToggle={() => toggleOne(r.id)}
              />
            ))}
          </>
        )}
      </div>

      {(meta?.hasPrev || meta?.hasNext) && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!meta?.hasPrev} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

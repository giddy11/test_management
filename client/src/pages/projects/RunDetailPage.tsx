import { useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { ChevronLeft, CheckCircle2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { ResultRow } from "@/components/testmgmt/ResultRow"
import { PageLoader } from "@/components/shared/PageLoader"
import { useRun, useResults, useUpdateRun } from "@/hooks/useRuns"
import { useCases } from "@/hooks/useCases"
import { ApiError } from "@/transport/http"

export default function RunDetailPage() {
  const { projectId = "", runId = "" } = useParams()
  const { data: run, isLoading } = useRun(runId)
  const { data: results = [] } = useResults(runId)
  const { data: casesData } = useCases(run?.suiteId ?? "", { limit: 100 })
  const updateRun = useUpdateRun()

  const caseTitle = useMemo(() => {
    const map = new Map((casesData?.data ?? []).map((c) => [c.id, c.title]))
    return (id: string) => map.get(id) ?? "Test case"
  }, [casesData])

  // Summary computed from the results this user can see (so it matches the list —
  // an assigned 'user' only sees their own cases).
  const summary = useMemo(() => {
    const s = { total: results.length, pass: 0, fail: 0, blocked: 0, skipped: 0, pending: 0 }
    for (const r of results) {
      const k = (r.status ?? "pending") as keyof typeof s
      s[k]++
    }
    return s
  }, [results])

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

      {summary.total > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Results — {summary.pass}/{summary.total} passed
            </CardTitle>
          </CardHeader>
          <CardContent><SummaryBar summary={summary} /></CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {results.length === 0 && (
          <p className="text-sm text-muted-foreground">No test cases assigned to you in this run.</p>
        )}
        {results.map((r) => (
          <ResultRow key={r.id} runId={runId} result={r} caseTitle={caseTitle(r.testCaseId)} />
        ))}
      </div>
    </div>
  )
}

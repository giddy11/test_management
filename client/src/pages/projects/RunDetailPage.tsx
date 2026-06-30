import { useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { ChevronLeft, CheckCircle2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { ResultRow } from "@/components/testmgmt/ResultRow"
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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
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

      {run.summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Results — {run.summary.pass ?? 0}/{run.summary.total} passed
            </CardTitle>
          </CardHeader>
          <CardContent><SummaryBar summary={run.summary} /></CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {results.length === 0 && (
          <p className="text-sm text-muted-foreground">This run has no test cases.</p>
        )}
        {results.map((r) => (
          <ResultRow key={r.id} runId={runId} result={r} caseTitle={caseTitle(r.testCaseId)} />
        ))}
      </div>
    </div>
  )
}

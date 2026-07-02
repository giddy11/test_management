import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Play, Trash2, FlaskConical, Layers, User, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { CreateRunDialog } from "@/components/testmgmt/CreateRunDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { InlineLoader } from "@/components/shared/PageLoader"
import { useRuns, useDeleteRun } from "@/hooks/useRuns"
import { useSuites } from "@/hooks/useSuites"
import type { TestRun } from "@/types/testMgmt.types"

export function RunsTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const navigate = useNavigate()
  const { data: runs = [], isLoading } = useRuns(projectId)
  const { data: suites = [] } = useSuites(projectId)
  const del = useDeleteRun()

  const suiteMap = useMemo(
    () => new Map(suites.map((s) => [s.id, s.name])),
    [suites]
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<TestRun | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)} data-tour="start-run-btn">
          <Play className="mr-1 size-4" /> Start run
        </Button>
      </div>

      {isLoading && <InlineLoader className="py-8" />}
      {!isLoading && runs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <FlaskConical className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No test runs yet. Start one to track execution.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {runs.map((run) => (
          <Card
            key={run.id}
            className="cursor-pointer transition-colors hover:border-primary/50"
            onClick={() => navigate(`/projects/${projectId}/runs/${run.id}`)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{run.name}</CardTitle>
                  {suiteMap.get(run.suiteId) && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Layers className="size-3 shrink-0" />
                      {suiteMap.get(run.suiteId)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={run.status === "completed" ? "default" : "secondary"}>
                    {run.status === "completed" ? "Completed" : "In progress"}
                  </Badge>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setDeleting(run) }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* People */}
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {run.createdByName && (
                  <span className="flex items-center gap-1.5">
                    <User className="size-3 shrink-0" />
                    Started by <span className="font-medium text-foreground">{run.createdByName}</span>
                  </span>
                )}
                {run.testers && run.testers.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3 shrink-0" />
                    Tested by{" "}
                    <span className="font-medium text-foreground">
                      {run.testers.slice(0, 3).join(", ")}
                      {run.testers.length > 3 && ` +${run.testers.length - 3} more`}
                    </span>
                  </span>
                )}
              </div>

              {run.summary && run.summary.total > 0 ? (
                <SummaryBar summary={run.summary} />
              ) : (
                <p className="text-xs text-muted-foreground">Open to record results</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <CreateRunDialog open={createOpen} onOpenChange={setCreateOpen} projectId={projectId} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete run"
        description={`"${deleting?.name ?? "This run"}" and its recorded results will be removed.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
            onSuccess: () => { toast.success("Run deleted"); setDeleting(null) },
          })
        }
      />
    </div>
  )
}

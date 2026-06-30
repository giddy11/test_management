import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Play, Trash2, FlaskConical } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { CreateRunDialog } from "@/components/testmgmt/CreateRunDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useRuns, useDeleteRun } from "@/hooks/useRuns"
import type { TestRun } from "@/types/testMgmt.types"

export function RunsTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const navigate = useNavigate()
  const { data: runs = [], isLoading } = useRuns(projectId)
  const del = useDeleteRun()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<TestRun | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Play className="mr-1 size-4" /> Start run
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
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
                <CardTitle className="text-base">{run.name}</CardTitle>
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
            <CardContent>
              {run.summary ? (
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

import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Play, Pencil, Trash2, FlaskConical } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { CreateRunDialog } from "@/components/testmgmt/CreateRunDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { InlineLoader } from "@/components/shared/PageLoader"
import { useRuns, useDeleteRun, useActiveRunStatus, useUpdateRun } from "@/hooks/useRuns"
import { useSuites } from "@/hooks/useSuites"
import type { TestRun } from "@/types/testMgmt.types"

export function RunsTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const navigate = useNavigate()
  const { data: runs = [], isLoading } = useRuns(projectId)
  const { data: suites = [] } = useSuites(projectId)
  const { data: activeStatus } = useActiveRunStatus(projectId)
  const del = useDeleteRun()

  const suiteMap = useMemo(
    () => new Map(suites.map((s) => [s.id, s.name])),
    [suites]
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [deleting, setDeleting] = useState<TestRun | null>(null)
  const [renaming, setRenaming] = useState<TestRun | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const updateRun = useUpdateRun()

  const saveRename = () => {
    const name = renameValue.trim()
    if (!renaming || !name) return
    if (name === renaming.name) {
      setRenaming(null)
      return
    }
    updateRun.mutate(
      { id: renaming.id, payload: { name } },
      {
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
        onSuccess: () => { toast.success("Run renamed"); setRenaming(null) },
      }
    )
  }

  const activeSuiteIds = activeStatus?.activeSuiteIds ?? []
  // Only block "Start run" outright when every suite already has a run in progress —
  // otherwise the dialog lets the user pick a suite that's still free.
  const allSuitesBusy = suites.length > 0 && suites.every((s) => activeSuiteIds.includes(s.id))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                disabled={allSuitesBusy}
                data-tour="start-run-btn"
                data-cy="start-run"
              >
                <Play className="mr-1 size-4" /> Start run
              </Button>
            </span>
          </TooltipTrigger>
          {allSuitesBusy && (
            <TooltipContent>
              Every suite already has a test run in progress. Complete one before starting another.
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Suite</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started by</TableHead>
              <TableHead>Tested by</TableHead>
              <TableHead className="w-56">Progress</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="h-24"><InlineLoader /></TableCell></TableRow>
            )}
            {!isLoading && runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <FlaskConical className="size-7 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No test runs yet. Start one to track execution.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {runs.map((run) => (
              <TableRow
                key={run.id}
                data-cy="run-card"
                className="cursor-pointer"
                onClick={() => navigate(`/projects/${projectId}/runs/${run.id}`)}
              >
                <TableCell className="max-w-xs whitespace-normal font-medium">{run.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {suiteMap.get(run.suiteId) ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={run.status === "completed" ? "default" : "secondary"}>
                    {run.status === "completed" ? "Completed" : "In progress"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{run.createdByName ?? "—"}</TableCell>
                <TableCell className="max-w-50 truncate text-sm text-muted-foreground">
                  {run.testers && run.testers.length > 0 ? (
                    <span title={run.testers.join(", ")}>
                      {run.testers.slice(0, 2).join(", ")}
                      {run.testers.length > 2 && ` +${run.testers.length - 2}`}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {run.summary && run.summary.total > 0 ? (
                    <SummaryBar summary={run.summary} compact />
                  ) : (
                    <span className="text-xs text-muted-foreground">Open to record results</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Rename run"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRenameValue(run.name)
                      setRenaming(run)
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete run"
                      onClick={(e) => { e.stopPropagation(); setDeleting(run) }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateRunDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        activeSuiteIds={activeSuiteIds}
      />
      <Dialog open={Boolean(renaming)} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename run</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveRename()
            }}
          >
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus maxLength={200} />
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateRun.isPending || !renameValue.trim()}>
                {updateRun.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

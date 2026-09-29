import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Pencil, Trash2, Layers, ChevronRight, ClipboardList, Download } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SummaryBar } from "@/components/shared/SummaryBar"
import { SuiteFormDialog } from "@/components/testmgmt/SuiteFormDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { InlineLoader } from "@/components/shared/PageLoader"
import { ClearFiltersButton } from "@/components/shared/ClearFiltersButton"
import { useSuites, useDeleteSuite } from "@/hooks/useSuites"
import { useExportProject } from "@/hooks/useExport"
import { useDebounce } from "@/hooks/useDebounce"
import { usePersistedState } from "@/hooks/usePersistedState"
import type { SuiteBreakdown, TestSuite } from "@/types/testMgmt.types"

export function SuitesTab({
  projectId,
  projectName,
  canManage,
  breakdown,
}: {
  projectId: string
  projectName: string
  canManage: boolean
  breakdown?: Map<string, SuiteBreakdown>
}) {
  const navigate = useNavigate()
  // Search persists per project so it survives opening a suite and coming back.
  const [searchInput, setSearchInput] = usePersistedState(`suites:search:${projectId}`, "")
  const search = useDebounce(searchInput, 300)
  const { data: suites = [], isLoading } = useSuites(projectId, { search: search || undefined })
  const del = useDeleteSuite()
  const exportProject = useExportProject(projectId, projectName)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TestSuite | null>(null)
  const [deleting, setDeleting] = useState<TestSuite | null>(null)

  const handleExport = () =>
    exportProject.mutate(undefined, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Export failed"),
      onSuccess: () => toast.success("Export downloaded"),
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search suites…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="sm:max-w-xs"
          data-cy="suite-search"
        />
        <ClearFiltersButton active={Boolean(search)} onClick={() => setSearchInput("")} />
        <div className="flex gap-2 sm:ml-auto">
          {(suites.length > 0 || search) && (
            <Button size="sm" variant="outline" onClick={handleExport} disabled={exportProject.isPending}>
              <Download className="mr-1 size-4" /> {exportProject.isPending ? "Exporting…" : "Export all"}
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }} data-tour="new-suite-btn" data-cy="new-suite">
              <Plus className="mr-1 size-4" /> New suite
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Suite</TableHead>
              <TableHead>Test cases</TableHead>
              <TableHead className="w-56">Results</TableHead>
              {canManage && <TableHead className="w-24 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={canManage ? 4 : 3} className="h-24"><InlineLoader /></TableCell></TableRow>
            )}
            {!isLoading && suites.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="h-32">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Layers className="size-7 text-muted-foreground" />
                    {search ? (
                      <p className="text-sm text-muted-foreground">No suites match “{search}”.</p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">No test suites yet.</p>
                        {canManage && <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>Create a suite</Button>}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {suites.map((s) => {
              const bd = breakdown?.get(s.id)
              const executed = bd ? bd.pass + bd.fail + bd.blocked + bd.skipped + bd.pending : 0
              return (
                <TableRow
                  key={s.id}
                  data-cy="suite-card"
                  className="group cursor-pointer"
                  onClick={() => navigate(`/projects/${projectId}/suites/${s.id}`)}
                >
                  <TableCell className="max-w-md whitespace-normal">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium leading-snug">{s.name}</p>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{s.description || "No description"}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <ClipboardList className="size-3 shrink-0" />
                      {s.caseCount === 0
                        ? <span className="text-amber-600">No test cases yet</span>
                        : <span>{s.caseCount} test case{s.caseCount === 1 ? "" : "s"}</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    {bd && executed > 0 ? (
                      <SummaryBar
                        compact
                        summary={{ total: executed, pass: bd.pass, fail: bd.fail, blocked: bd.blocked, skipped: bd.skipped, pending: bd.pending }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Not run</span>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" data-cy="suite-edit" onClick={(e) => { e.stopPropagation(); setEditing(s); setFormOpen(true) }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" data-cy="suite-delete" onClick={(e) => { e.stopPropagation(); setDeleting(s) }}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <SuiteFormDialog open={formOpen} onOpenChange={setFormOpen} projectId={projectId} editing={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete suite"
        description={`"${deleting?.name ?? "This suite"}" and its test cases will be removed.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
            onSuccess: () => { toast.success("Suite deleted"); setDeleting(null) },
          })
        }
      />
    </div>
  )
}

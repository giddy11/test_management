import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, Plus, Pencil, Trash2, FileUp, UserPlus, Paperclip, Download } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CaseFormDialog } from "@/components/testmgmt/CaseFormDialog"
import { ImportCasesDialog } from "@/components/testmgmt/ImportCasesDialog"
import { AssignDialog } from "@/components/testmgmt/AssignDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { InlineLoader } from "@/components/shared/PageLoader"
import { PriorityBadge, CaseStatusBadge, ResultBadge } from "@/components/shared/StatusBadge"
import { PresenceDot } from "@/components/shared/PresenceDot"
import { useSuite } from "@/hooks/useSuites"
import { useCases, useDeleteCase, useBulkDeleteCases } from "@/hooks/useCases"
import { useExportSuite } from "@/hooks/useExport"
import { useCanManageProject } from "@/hooks/useProjects"
import { useDebounce } from "@/hooks/useDebounce"
import { TC_PRIORITIES, TC_STATUSES, RESULT_STATUSES, RESULT_META, type TcPriority, type TcStatus, type ResultStatus } from "@/lib/enums"
import type { TestCase } from "@/types/testMgmt.types"

export default function SuiteDetailPage() {
  const { projectId = "", suiteId = "" } = useParams()
  const navigate = useNavigate()
  const canManage = useCanManageProject(projectId)

  const { data: suite } = useSuite(suiteId)

  // filters + pagination
  const [searchInput, setSearchInput] = useState("")
  const search = useDebounce(searchInput, 300)
  const [priority, setPriority] = useState<TcPriority | undefined>()
  const [status, setStatus] = useState<TcStatus | undefined>()
  const [runStatus, setRunStatus] = useState<string | undefined>()
  const [page, setPage] = useState(1)

  useEffect(() => setPage(1), [search])

  const { data, isLoading } = useCases(suiteId, { page, search: search || undefined, priority, status, runStatus })
  const cases = data?.data ?? []
  const meta = data?.meta

  const del = useDeleteCase()
  const bulkDel = useBulkDeleteCases()
  const exportSuite = useExportSuite(suiteId, suite?.name ?? "")

  const handleExport = () =>
    exportSuite.mutate(undefined, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Export failed"),
      onSuccess: () => toast.success("Export downloaded"),
    })

  // Selection persists across pages (keyed by id, storing the case itself so
  // bulk actions still work for pages that are no longer loaded) — otherwise
  // paging through more than one screen's worth of cases would silently drop
  // the earlier page's picks. Only a filter/search change clears it, since
  // that changes what "selected" is scoped to.
  const [selected, setSelected] = useState<Map<string, TestCase>>(new Map())
  useEffect(() => setSelected(new Map()), [search, priority, status, runStatus])

  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<TestCase | null>(null)
  const [deleting, setDeleting] = useState<TestCase | null>(null)
  const [assigning, setAssigning] = useState<TestCase | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)

  const initials = (name: string) =>
    name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

  const allOnPageSelected = cases.length > 0 && cases.every((c) => selected.has(c.id))
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Map(prev)
      if (cases.every((c) => prev.has(c.id))) cases.forEach((c) => next.delete(c.id))
      else cases.forEach((c) => next.set(c.id, c))
      return next
    })
  const toggleOne = (tc: TestCase) =>
    setSelected((prev) => {
      const next = new Map(prev)
      next.has(tc.id) ? next.delete(tc.id) : next.set(tc.id, tc)
      return next
    })

  const filterValue = (v: string) => (v === "all" ? undefined : v)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={`/projects/${projectId}`} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> Back to project
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{suite?.name ?? "Suite"}</h1>
        </div>
        <div className="flex gap-2">
          {cases.length > 0 && (
            <Button variant="outline" onClick={handleExport} disabled={exportSuite.isPending} className="flex-1 sm:flex-none" data-cy="export-suite">
              <Download className="mr-1 size-4" /> {exportSuite.isPending ? "Exporting…" : "Export"}
            </Button>
          )}
          {canManage && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)} className="flex-1 sm:flex-none" data-cy="import-cases">
                <FileUp className="mr-1 size-4" /> Import
              </Button>
              <Button onClick={() => { setEditing(null); setFormOpen(true) }} className="flex-1 sm:flex-none" data-cy="new-case">
                <Plus className="mr-1 size-4" /> New test case
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by title…"
          data-cy="case-search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={priority ?? "all"} onValueChange={(v) => { setPriority(filterValue(v) as TcPriority | undefined); setPage(1) }}>
          <SelectTrigger className="sm:w-[160px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {TC_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status ?? "all"} onValueChange={(v) => { setStatus(filterValue(v) as TcStatus | undefined); setPage(1) }}>
          <SelectTrigger className="sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={runStatus ?? "all"} onValueChange={(v) => { setRunStatus(filterValue(v)); setPage(1) }}>
          <SelectTrigger className="sm:w-[175px]"><SelectValue placeholder="Run result" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All run results</SelectItem>
            <SelectItem value="not_run">Not run</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            {RESULT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{RESULT_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && selected.size > 0 && (
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => setBulkAssignOpen(true)}>
              <UserPlus className="mr-1 size-4" /> Assignees ({selected.size})
            </Button>
            <Button variant="destructive" onClick={() => setBulkOpen(true)}>
              <Trash2 className="mr-1 size-4" /> Delete selected ({selected.size})
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {canManage && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all on page"
                  />
                </TableHead>
              )}
              <TableHead className="w-12">S/N</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Run Result</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={canManage ? 10 : 9} className="h-24"><InlineLoader /></TableCell></TableRow>
            )}
            {!isLoading && cases.length === 0 && (
              <TableRow><TableCell colSpan={canManage ? 10 : 9} className="h-24 text-center text-muted-foreground">No test cases match.</TableCell></TableRow>
            )}
            {cases.map((tc, idx) => (
              <TableRow
                key={tc.id}
                data-cy="case-row"
                data-state={selected.has(tc.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => navigate(`/projects/${projectId}/suites/${suiteId}/cases/${tc.id}`)}
              >
                {canManage && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(tc.id)}
                      onCheckedChange={() => toggleOne(tc)}
                      aria-label={`Select ${tc.title}`}
                    />
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">
                  {(page - 1) * (meta?.limit ?? 20) + idx + 1}
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium leading-snug">{tc.title}</p>
                      {tc.attachmentCount > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                          title={`${tc.attachmentCount} attachment${tc.attachmentCount === 1 ? "" : "s"}`}
                        >
                          <Paperclip className="size-2.5" />
                          {tc.attachmentCount}
                        </span>
                      )}
                    </div>
                    {tc.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                        {tc.description}
                      </p>
                    )}
                    {tc.steps?.length > 0 && (
                      <p className="text-[11px] text-muted-foreground/70">
                        {tc.steps.length} step{tc.steps.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell><PriorityBadge value={tc.priority} /></TableCell>
                <TableCell><CaseStatusBadge value={tc.status} /></TableCell>
                <TableCell>
                  {tc.latestResultStatus === null ? (
                    <span className="text-xs text-muted-foreground">Not run</span>
                  ) : (
                    <ResultBadge value={tc.latestResultStatus === "pending" ? null : tc.latestResultStatus as ResultStatus} />
                  )}
                </TableCell>
                <TableCell>
                  {tc.assignees.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex -space-x-2">
                      {tc.assignees.slice(0, 3).map((a) => (
                        <div key={a.id} className="relative">
                          <Avatar className="size-6 border-2 border-background" title={a.name}>
                            <AvatarFallback className="text-[10px]">{initials(a.name)}</AvatarFallback>
                          </Avatar>
                          <PresenceDot userId={a.id} className="absolute -bottom-0.5 -right-0.5 size-2" />
                        </div>
                      ))}
                      {tc.assignees.length > 3 && (
                        <span className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px]">
                          +{tc.assignees.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {tc.deadline
                    ? new Date(tc.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                    : "—"}
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {tc.tags?.length ? tc.tags.join(", ") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {canManage && (
                    <>
                      <Button variant="ghost" size="sm" data-cy="case-assign" onClick={(e) => { e.stopPropagation(); setAssigning(tc) }}>
                        <UserPlus className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" data-cy="case-edit" onClick={(e) => { e.stopPropagation(); setEditing(tc); setFormOpen(true) }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" data-cy="case-delete" onClick={(e) => { e.stopPropagation(); setDeleting(tc) }}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {(meta?.hasNext || page > 1) && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <CaseFormDialog open={formOpen} onOpenChange={setFormOpen} suiteId={suiteId} editing={editing} />
      <ImportCasesDialog open={importOpen} onOpenChange={setImportOpen} suiteId={suiteId} />
      <AssignDialog
        open={Boolean(assigning)}
        onOpenChange={(o) => !o && setAssigning(null)}
        projectId={projectId}
        testCase={assigning}
      />
      <AssignDialog
        open={bulkAssignOpen}
        onOpenChange={(o) => {
          setBulkAssignOpen(o)
          if (!o) setSelected(new Map())
        }}
        projectId={projectId}
        bulkCases={[...selected.values()].map((c) => ({ id: c.id, existingAssigneeIds: c.assignees.map((a) => a.id) }))}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete test case"
        description={`"${deleting?.title ?? "This case"}" will be removed.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
            onSuccess: () => { toast.success("Test case deleted"); setDeleting(null) },
          })
        }
      />

      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Delete ${selected.size} test case${selected.size === 1 ? "" : "s"}`}
        description="The selected test cases will be removed. This can't be undone from the UI."
        confirmLabel={`Delete ${selected.size}`}
        loading={bulkDel.isPending}
        onConfirm={() =>
          bulkDel.mutate([...selected.keys()], {
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
            onSuccess: (res) => {
              toast.success(`Deleted ${res.deleted} test case${res.deleted === 1 ? "" : "s"}`)
              setSelected(new Map())
              setBulkOpen(false)
            },
          })
        }
      />
    </div>
  )
}

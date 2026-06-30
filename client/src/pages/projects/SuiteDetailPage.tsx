import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, Plus, Pencil, Trash2, FileUp, UserPlus, Paperclip } from "lucide-react"
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
import { PriorityBadge, CaseStatusBadge } from "@/components/shared/StatusBadge"
import { useSuite } from "@/hooks/useSuites"
import { useCases, useDeleteCase, useBulkDeleteCases } from "@/hooks/useCases"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"
import { TC_PRIORITIES, TC_STATUSES, type TcPriority, type TcStatus } from "@/lib/enums"
import type { TestCase } from "@/types/testMgmt.types"

export default function SuiteDetailPage() {
  const { projectId = "", suiteId = "" } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN

  const { data: suite } = useSuite(suiteId)

  // filters + pagination
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [priority, setPriority] = useState<TcPriority | undefined>()
  const [status, setStatus] = useState<TcStatus | undefined>()
  const [page, setPage] = useState(1)

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading } = useCases(suiteId, { page, search: search || undefined, priority, status })
  const cases = data?.data ?? []
  const meta = data?.meta

  const del = useDeleteCase()
  const bulkDel = useBulkDeleteCases()

  // selection (per page)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => setSelected(new Set()), [page, search, priority, status])

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
      const next = new Set(prev)
      if (cases.every((c) => prev.has(c.id))) cases.forEach((c) => next.delete(c.id))
      else cases.forEach((c) => next.add(c.id))
      return next
    })
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
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
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="flex-1 sm:flex-none">
              <FileUp className="mr-1 size-4" /> Import
            </Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true) }} className="flex-1 sm:flex-none">
              <Plus className="mr-1 size-4" /> New test case
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by title…"
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
        {canManage && selected.size > 0 && (
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => setBulkAssignOpen(true)}>
              <UserPlus className="mr-1 size-4" /> Assign selected ({selected.size})
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
              <TableHead>Title</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={canManage ? 8 : 7} className="h-24"><InlineLoader /></TableCell></TableRow>
            )}
            {!isLoading && cases.length === 0 && (
              <TableRow><TableCell colSpan={canManage ? 8 : 7} className="h-24 text-center text-muted-foreground">No test cases match.</TableCell></TableRow>
            )}
            {cases.map((tc) => (
              <TableRow
                key={tc.id}
                data-state={selected.has(tc.id) ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => navigate(`/projects/${projectId}/suites/${suiteId}/cases/${tc.id}`)}
              >
                {canManage && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(tc.id)}
                      onCheckedChange={() => toggleOne(tc.id)}
                      aria-label={`Select ${tc.title}`}
                    />
                  </TableCell>
                )}
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
                  {tc.assignees.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex -space-x-2">
                      {tc.assignees.slice(0, 3).map((a) => (
                        <Avatar key={a.id} className="size-6 border-2 border-background" title={a.name}>
                          <AvatarFallback className="text-[10px]">{initials(a.name)}</AvatarFallback>
                        </Avatar>
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
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setAssigning(tc) }}>
                        <UserPlus className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(tc); setFormOpen(true) }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleting(tc) }}>
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
      <AssignDialog open={Boolean(assigning)} onOpenChange={(o) => !o && setAssigning(null)} testCase={assigning} />
      <AssignDialog
        open={bulkAssignOpen}
        onOpenChange={(o) => {
          setBulkAssignOpen(o)
          if (!o) setSelected(new Set())
        }}
        caseIds={[...selected]}
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
          bulkDel.mutate([...selected], {
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
            onSuccess: (res) => {
              toast.success(`Deleted ${res.deleted} test case${res.deleted === 1 ? "" : "s"}`)
              setSelected(new Set())
              setBulkOpen(false)
            },
          })
        }
      />
    </div>
  )
}

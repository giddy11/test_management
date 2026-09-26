import { useEffect, useState } from "react"
import { Plus, Bug as BugIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InlineLoader } from "@/components/shared/PageLoader"
import { DateRangeFilter } from "@/components/shared/DateRangeFilter"
import { SearchByInput, type SearchByOption } from "@/components/shared/SearchByInput"
import { BugRow } from "@/components/bugs/BugRow"
import { BugFormDialog } from "@/components/bugs/BugFormDialog"
import { useBugs } from "@/hooks/useBugs"
import { useDebounce } from "@/hooks/useDebounce"
import { usePersistedState } from "@/hooks/usePersistedState"
import { BUG_STATUSES, BUG_STATUS_META, type BugStatus } from "@/lib/enums"
import type { BugSearchField } from "@/types/bug.types"

const SEARCH_OPTIONS: SearchByOption<BugSearchField>[] = [
  { value: "title", label: "Title", placeholder: "Search by title…" },
  { value: "reporter", label: "Reporter", placeholder: "Search by reporter name…" },
  { value: "suite", label: "Suite", placeholder: "Search by test suite…" },
  { value: "assignee", label: "Assigned to", placeholder: "Search by assigned engineer…" },
]

export function BugsTab({ projectId }: { projectId: string }) {
  // Filters persist per project so they survive opening a bug and coming back.
  const [searchInput, setSearchInput] = usePersistedState(`bugs:search:${projectId}`, "")
  const search = useDebounce(searchInput, 300)
  const [searchBy, setSearchBy] = usePersistedState<BugSearchField>(`bugs:searchBy:${projectId}`, "title")
  const [status, setStatus] = usePersistedState<BugStatus | null>(`bugs:status:${projectId}`, null)
  // Report-date range, YYYY-MM-DD; "" = no bound.
  const [from, setFrom] = usePersistedState(`bugs:from:${projectId}`, "")
  const [to, setTo] = usePersistedState(`bugs:to:${projectId}`, "")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => setPage(1), [search, searchBy, from, to])

  const { data, isLoading, isError, error } = useBugs(projectId, {
    page,
    limit: 20,
    status: status ?? undefined,
    search: search || undefined,
    // Only meaningful alongside a search term — omitted otherwise so switching
    // the picker on an empty box doesn't trigger a refetch.
    searchBy: search ? searchBy : undefined,
    from: from || undefined,
    to: to || undefined,
  })
  const bugs = data?.data ?? []

  const filterValue = (v: string) => (v === "all" ? null : v)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchByInput
          options={SEARCH_OPTIONS}
          field={searchBy}
          onFieldChange={setSearchBy}
          value={searchInput}
          onValueChange={setSearchInput}
          className="sm:w-96"
        />
        <Select
          value={status ?? "all"}
          onValueChange={(v) => { setStatus(filterValue(v) as BugStatus | null); setPage(1) }}
        >
          <SelectTrigger className="sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {BUG_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{BUG_STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <Button size="sm" onClick={() => setFormOpen(true)} className="sm:ml-auto" data-cy="report-bug">
          <Plus className="mr-1 size-4" /> Report bug
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load bugs"}
        </p>
      )}

      {!isError && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Ref</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Reported by</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Reported</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="h-24"><InlineLoader /></TableCell></TableRow>
              )}
              {!isLoading && bugs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <BugIcon className="size-7 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No bugs reported yet.</p>
                      <Button size="sm" onClick={() => setFormOpen(true)}>Report the first one</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {bugs.map((b) => <BugRow key={b.id} bug={b} />)}
            </TableBody>
          </Table>
        </div>
      )}

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!data.meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <BugFormDialog open={formOpen} onOpenChange={setFormOpen} projectId={projectId} />
    </div>
  )
}

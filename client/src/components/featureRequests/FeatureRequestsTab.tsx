import { useEffect, useState } from "react"
import { Plus, Lightbulb } from "lucide-react"
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
import { ClearFiltersButton } from "@/components/shared/ClearFiltersButton"
import { DateRangeFilter } from "@/components/shared/DateRangeFilter"
import { SearchByInput, type SearchByOption } from "@/components/shared/SearchByInput"
import { FeatureRequestRow } from "@/components/featureRequests/FeatureRequestRow"
import { FeatureRequestFormDialog } from "@/components/featureRequests/FeatureRequestFormDialog"
import { useFeatureRequests } from "@/hooks/useFeatureRequests"
import { useTicketLinkSummary } from "@/hooks/useTicketLinks"
import { useDebounce } from "@/hooks/useDebounce"
import { usePersistedState } from "@/hooks/usePersistedState"
import { FEATURE_REQUEST_STATUSES, FEATURE_REQUEST_STATUS_META, type FeatureRequestStatus } from "@/lib/enums"
import type { FeatureRequestSearchField } from "@/types/featureRequest.types"

// Requests have no suite or assignee, so only these two fields are searchable.
const SEARCH_OPTIONS: SearchByOption<FeatureRequestSearchField>[] = [
  { value: "title", label: "Title", placeholder: "Search by title…" },
  { value: "reporter", label: "Reporter", placeholder: "Search by reporter name…" },
]

export function FeatureRequestsTab({ projectId }: { projectId: string }) {
  // Filters persist per project so they survive opening a request and coming back.
  const [searchInput, setSearchInput] = usePersistedState(`feature-requests:search:${projectId}`, "")
  const search = useDebounce(searchInput, 300)
  const [searchBy, setSearchBy] = usePersistedState<FeatureRequestSearchField>(
    `feature-requests:searchBy:${projectId}`,
    "title"
  )
  const [status, setStatus] = usePersistedState<FeatureRequestStatus | null>(
    `feature-requests:status:${projectId}`,
    null
  )
  const [sort, setSort] = usePersistedState<"top" | "newest">(`feature-requests:sort:${projectId}`, "top")
  // Submission-date range, YYYY-MM-DD; "" = no bound.
  const [from, setFrom] = usePersistedState(`feature-requests:from:${projectId}`, "")
  const [to, setTo] = usePersistedState(`feature-requests:to:${projectId}`, "")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => setPage(1), [search, searchBy, from, to])

  const { data, isLoading, isError, error } = useFeatureRequests(projectId, {
    page,
    limit: 20,
    status: status ?? undefined,
    sort,
    search: search || undefined,
    // Only meaningful alongside a search term — omitted otherwise so switching
    // the picker on an empty box doesn't trigger a refetch.
    searchBy: search ? searchBy : undefined,
    from: from || undefined,
    to: to || undefined,
  })
  const requests = data?.data ?? []
  // "Reported 3×" / "Repeat" badges for the requests on this page.
  const { data: linkSummary } = useTicketLinkSummary(projectId, "feature_request", requests.map((r) => r.id))

  const filterValue = (v: string) => (v === "all" ? null : v)
  // Sort isn't a filter (it doesn't narrow the list), so clearing leaves it alone.
  const filtersActive = Boolean(searchInput || status || from || to)
  const clearFilters = () => {
    setSearchInput("")
    setSearchBy("title")
    setStatus(null)
    setFrom("")
    setTo("")
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchByInput
          options={SEARCH_OPTIONS}
          field={searchBy}
          onFieldChange={setSearchBy}
          value={searchInput}
          onValueChange={setSearchInput}
          className="sm:w-80"
        />
        <Select
          value={status ?? "all"}
          onValueChange={(v) => { setStatus(filterValue(v) as FeatureRequestStatus | null); setPage(1) }}
        >
          <SelectTrigger className="sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {FEATURE_REQUEST_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{FEATURE_REQUEST_STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => { setSort(v as "top" | "newest"); setPage(1) }}>
          <SelectTrigger className="sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="top">Top</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
          </SelectContent>
        </Select>
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <ClearFiltersButton active={filtersActive} onClick={clearFilters} />
        <Button size="sm" onClick={() => setFormOpen(true)} className="sm:ml-auto" data-cy="new-feature-request">
          <Plus className="mr-1 size-4" /> New request
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load feature requests"}
        </p>
      )}

      {!isError && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Votes</TableHead>
                <TableHead className="w-28">Ref</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Submitted by</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="h-24"><InlineLoader /></TableCell></TableRow>
              )}
              {!isLoading && requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-32">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Lightbulb className="size-7 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No feature requests yet.</p>
                      <Button size="sm" onClick={() => setFormOpen(true)}>Submit the first one</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {requests.map((r) => <FeatureRequestRow key={r.id} request={r} links={linkSummary?.[r.id]} />)}
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

      <FeatureRequestFormDialog open={formOpen} onOpenChange={setFormOpen} projectId={projectId} />
    </div>
  )
}

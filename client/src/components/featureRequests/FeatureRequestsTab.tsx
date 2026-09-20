import { useEffect, useState } from "react"
import { Plus, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InlineLoader } from "@/components/shared/PageLoader"
import { FeatureRequestCard } from "@/components/featureRequests/FeatureRequestCard"
import { FeatureRequestFormDialog } from "@/components/featureRequests/FeatureRequestFormDialog"
import { useFeatureRequests } from "@/hooks/useFeatureRequests"
import { useDebounce } from "@/hooks/useDebounce"
import { usePersistedState } from "@/hooks/usePersistedState"
import { FEATURE_REQUEST_STATUSES, FEATURE_REQUEST_STATUS_META, type FeatureRequestStatus } from "@/lib/enums"

export function FeatureRequestsTab({ projectId }: { projectId: string }) {
  // Filters persist per project so they survive opening a request and coming back.
  const [searchInput, setSearchInput] = usePersistedState(`feature-requests:search:${projectId}`, "")
  const search = useDebounce(searchInput, 300)
  const [status, setStatus] = usePersistedState<FeatureRequestStatus | null>(
    `feature-requests:status:${projectId}`,
    null
  )
  const [sort, setSort] = usePersistedState<"top" | "newest">(`feature-requests:sort:${projectId}`, "top")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => setPage(1), [search])

  const { data, isLoading, isError, error } = useFeatureRequests(projectId, {
    page,
    limit: 20,
    status: status ?? undefined,
    sort,
    search: search || undefined,
  })
  const requests = data?.data ?? []

  const filterValue = (v: string) => (v === "all" ? null : v)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search requests…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="sm:max-w-xs"
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
        <Button size="sm" onClick={() => setFormOpen(true)} className="sm:ml-auto" data-cy="new-feature-request">
          <Plus className="mr-1 size-4" /> New request
        </Button>
      </div>

      {isLoading && <InlineLoader className="py-8" />}
      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load feature requests"}
        </p>
      )}

      {!isLoading && !isError && requests.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Lightbulb className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No feature requests yet.</p>
            <Button size="sm" onClick={() => setFormOpen(true)}>Submit the first one</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {requests.map((r) => <FeatureRequestCard key={r.id} request={r} />)}
      </div>

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

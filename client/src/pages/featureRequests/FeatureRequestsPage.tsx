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
import { PageLoader } from "@/components/shared/PageLoader"
import { FeatureRequestCard } from "@/components/featureRequests/FeatureRequestCard"
import { FeatureRequestFormDialog } from "@/components/featureRequests/FeatureRequestFormDialog"
import { useFeatureRequests } from "@/hooks/useFeatureRequests"
import { FEATURE_REQUEST_STATUSES, FEATURE_REQUEST_STATUS_META, type FeatureRequestStatus } from "@/lib/enums"

export default function FeatureRequestsPage() {
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<FeatureRequestStatus | undefined>()
  const [sort, setSort] = useState<"top" | "newest">("top")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, isError, error } = useFeatureRequests({
    page,
    limit: 20,
    status,
    sort,
    search: search || undefined,
  })
  const requests = data?.data ?? []

  const filterValue = (v: string) => (v === "all" ? undefined : v)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Feature Requests</h1>
          <p className="text-sm text-muted-foreground">Suggest and vote on what TestMate should build next.</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="w-full sm:w-auto">
          <Plus className="mr-1 size-4" /> New request
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search requests…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={status ?? "all"}
          onValueChange={(v) => { setStatus(filterValue(v) as FeatureRequestStatus | undefined); setPage(1) }}
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
      </div>

      {isLoading && <PageLoader />}
      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load feature requests"}
        </p>
      )}

      {!isLoading && !isError && requests.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Lightbulb className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No feature requests yet.</p>
            <Button onClick={() => setFormOpen(true)}>Submit the first one</Button>
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

      <FeatureRequestFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}

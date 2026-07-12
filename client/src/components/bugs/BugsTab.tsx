import { useEffect, useState } from "react"
import { Plus, Bug as BugIcon } from "lucide-react"
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
import { BugCard } from "@/components/bugs/BugCard"
import { BugFormDialog } from "@/components/bugs/BugFormDialog"
import { useBugs } from "@/hooks/useBugs"
import { useDebounce } from "@/hooks/useDebounce"
import { BUG_STATUSES, BUG_STATUS_META, type BugStatus } from "@/lib/enums"

export function BugsTab({ projectId }: { projectId: string }) {
  const [searchInput, setSearchInput] = useState("")
  const search = useDebounce(searchInput, 300)
  const [status, setStatus] = useState<BugStatus | undefined>()
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => setPage(1), [search])

  const { data, isLoading, isError, error } = useBugs(projectId, {
    page,
    limit: 20,
    status,
    search: search || undefined,
  })
  const bugs = data?.data ?? []

  const filterValue = (v: string) => (v === "all" ? undefined : v)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          placeholder="Search bugs…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={status ?? "all"}
          onValueChange={(v) => { setStatus(filterValue(v) as BugStatus | undefined); setPage(1) }}
        >
          <SelectTrigger className="sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {BUG_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{BUG_STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setFormOpen(true)} className="sm:ml-auto" data-cy="report-bug">
          <Plus className="mr-1 size-4" /> Report bug
        </Button>
      </div>

      {isLoading && <InlineLoader className="py-8" />}
      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load bugs"}
        </p>
      )}

      {!isLoading && !isError && bugs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <BugIcon className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No bugs reported yet.</p>
            <Button size="sm" onClick={() => setFormOpen(true)}>Report the first one</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {bugs.map((b) => <BugCard key={b.id} bug={b} />)}
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

      <BugFormDialog open={formOpen} onOpenChange={setFormOpen} projectId={projectId} />
    </div>
  )
}

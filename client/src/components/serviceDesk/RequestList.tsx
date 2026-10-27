// components/serviceDesk/RequestList.tsx — the rows My requests, Approvals
// and the IT queue all show, with simple previous/next paging.
import { Link } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CategoryIcon, NeededByBadge, OverdueBadge, RequestPriorityBadge, RequestStatusBadge, When } from "@/components/serviceDesk/RequestBits"
import type { PaginationMeta } from "@/types/api.types"
import type { ServiceRequest } from "@/types/serviceDesk.types"

const ICON_FOR_CATEGORY: Record<string, string> = {
  software_access: "app-window",
  hardware: "laptop",
  new_account: "user-plus",
  password_reset: "key-round",
  business_application: "briefcase",
  cloud_resource: "cloud",
  access_card: "id-card",
  it_solution: "lightbulb",
}

export function RequestList({
  requests,
  isLoading,
  emptyText,
  showRequester = false,
  showAssignee = false,
  meta,
  onPage,
}: {
  requests: ServiceRequest[]
  isLoading: boolean
  emptyText: string
  showRequester?: boolean
  showAssignee?: boolean
  meta?: PaginationMeta
  onPage?: (page: number) => void
}) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!requests.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">{emptyText}</CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <Link key={r.id} to={`/requests/${r.id}`} className="block" data-cy="request-row">
          <Card className="transition-colors hover:border-primary/60 hover:bg-accent/30">
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <CategoryIcon name={ICON_FOR_CATEGORY[r.item.categoryKey]} className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
                  <span className="truncate font-medium">{r.title}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {r.item.name}
                  {showRequester && <> · from {r.requester.name}</>}
                  {r.requestedFor && <> · for {r.requestedFor.name}</>}
                  {showAssignee && <> · {r.assignee ? `with ${r.assignee.name}` : "unassigned"}</>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <OverdueBadge phase={r.overdue} level={r.escalationLevel} />
                {/* Approvers and IT see the requester's date; the requester typed it. */}
                {(showRequester || showAssignee) && <NeededByBadge value={r.neededBy} />}
                {r.priority !== "medium" && <RequestPriorityBadge value={r.priority} />}
                <RequestStatusBadge value={r.status} />
                <span className="w-16 text-right text-xs text-muted-foreground">
                  <When at={r.statusUpdatedAt ?? r.createdAt} />
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
      {meta && onPage && (meta.hasPrev || meta.hasNext) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-sm text-muted-foreground">
          <span>
            Page {meta.page} of {Math.max(meta.totalPages, 1)} · {meta.total} request{meta.total === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!meta.hasPrev} onClick={() => onPage(meta.page - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={!meta.hasNext} onClick={() => onPage(meta.page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

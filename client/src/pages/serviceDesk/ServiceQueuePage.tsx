// pages/serviceDesk/ServiceQueuePage.tsx — IT's queue: what's ready to pick
// up (no approval needed, or approved), what's being worked, what's still
// waiting on an approver, and what's done.
import { useState } from "react"
import { Inbox, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/transport/http"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RequestList } from "@/components/serviceDesk/RequestList"
import { ModuleOffNotice } from "@/components/serviceDesk/RequestBits"
import { useServiceAgents, useServiceDeskCounts, useServiceDeskSettings, useServiceRequests } from "@/hooks/useServiceDesk"
import { useDebounce } from "@/hooks/useDebounce"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"
import type { ListRequestsParams } from "@/types/serviceDesk.types"

type Tab = "ready" | "in_progress" | "review" | "overdue" | "pending_approval" | "info_requested" | "closed"

const FILTER: Record<Tab, Partial<ListRequestsParams>> = {
  ready: { view: "ready" },
  in_progress: { status: "in_progress" },
  review: { view: "review" },
  overdue: { view: "overdue" },
  pending_approval: { status: "pending_approval" },
  info_requested: { status: "info_requested" },
  closed: { view: "closed" },
}

const EMPTY: Record<Tab, string> = {
  ready: "Nothing waiting — the queue is clear.",
  in_progress: "Nobody is working on a request right now.",
  review: "Nothing is flagged for review.",
  overdue: "Nothing is past its service level. 🎉",
  pending_approval: "Nothing is waiting for an approver.",
  info_requested: "Nobody owes IT an answer.",
  closed: "No finished requests yet.",
}

export default function ServiceQueuePage() {
  const { user, permissions } = useAuth()
  const [tab, setTab] = useState<Tab>("ready")
  const [assignee, setAssignee] = useState("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search.trim(), 300)
  const { data: settings, isLoading: loadingSettings } = useServiceDeskSettings()
  const enabled = Boolean(settings?.enabled)
  const { data: counts } = useServiceDeskCounts(enabled)
  const { data: agents = [] } = useServiceAgents(enabled)
  const { data, isLoading, error, refetch } = useServiceRequests(
    {
      scope: "queue",
      ...FILTER[tab],
      assignee: assignee === "all" ? undefined : assignee,
      search: debounced || undefined,
      page,
      limit: 20,
    },
    enabled
  )

  if (loadingSettings) return <p className="text-sm text-muted-foreground">Loading…</p>

  const count = (n: number | undefined) =>
    n ? <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{n}</Badge> : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Inbox className="size-6 text-primary" /> IT queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Every submitted IT request in your organisation. Pick one up, work it, and mark it fulfilled.
        </p>
      </div>

      {!enabled ? (
        <ModuleOffNotice canManage={can(permissions, "servicedesk.manage")} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setPage(1) }}>
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="ready">Ready{count(counts?.queue?.ready)}</TabsTrigger>
                <TabsTrigger value="in_progress">In progress</TabsTrigger>
                <TabsTrigger value="review">Needs review{count(counts?.queue?.needsReview)}</TabsTrigger>
                <TabsTrigger value="overdue" className="data-[state=active]:text-red-600">Overdue{count(counts?.queue?.overdue)}</TabsTrigger>
                <TabsTrigger value="pending_approval">Awaiting approval{count(counts?.queue?.awaitingApproval)}</TabsTrigger>
                <TabsTrigger value="info_requested">Waiting on requester{count(counts?.queue?.waitingOnRequester)}</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={assignee} onValueChange={(v) => { setAssignee(v); setPage(1) }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="me">Assigned to me</SelectItem>
                {agents
                  .filter((a) => a.id !== user?.id)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-56 pl-8"
                placeholder="Title or SR number"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
          </div>
          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
              <span className="text-destructive">
                The queue couldn't be loaded{error instanceof ApiError ? `: ${error.message}` : "."}
              </span>
              <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : (
            <RequestList
              requests={data?.data ?? []}
              isLoading={isLoading}
              showRequester
              showAssignee
              emptyText={EMPTY[tab]}
              meta={data?.meta}
              onPage={setPage}
            />
          )}
        </>
      )}
    </div>
  )
}

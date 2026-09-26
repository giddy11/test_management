// pages/support/SupportActivityPage.tsx — an IT supporter's own activity log:
// stage changes, resolutions, and escalations for their client company, plus
// admin actions on their company's supporter roster. Scoped server-side to
// the actor's own clientCompanyId — never the rest of the organisation's log.
import { useState } from "react"
import {
  MessageSquareHeart,
  Building2,
  Activity as ActivityIcon,
  Filter,
  X,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageLoader } from "@/components/shared/PageLoader"
import { AuditSeverityBadge } from "@/components/shared/StatusBadge"
import { useActivity } from "@/hooks/useActivity"
import { timeAgo } from "@/lib/timeAgo"
import type { ActivityLog } from "@/types/activity.types"

const ICONS: Record<string, LucideIcon> = {
  feedback: MessageSquareHeart,
  client_company: Building2,
}

function iconFor(a: ActivityLog): LucideIcon {
  return ICONS[a.entityType ?? ""] ?? ActivityIcon
}

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

const ENTITY_TYPES = [
  { value: "feedback", label: "Ticket" },
  { value: "client_company", label: "Company" },
]

const ACTION_PREFIXES = [
  { value: "feedback.support", label: "Stage & resolution" },
  { value: "feedback.escalated", label: "Escalations" },
  { value: "client_company.supporter", label: "Supporter roster" },
]

export default function SupportActivityPage() {
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState<string>("")
  const [action, setAction] = useState<string>("")

  const { data, isLoading } = useActivity({
    page,
    limit: 30,
    entityType: entityType || undefined,
    action: action || undefined,
  })
  const items = data?.data ?? []
  const meta = data?.meta

  const hasFilter = Boolean(entityType || action)

  const clearFilters = () => {
    setEntityType("")
    setAction("")
    setPage(1)
  }

  const onEntityChange = (v: string) => { setEntityType(v === "all" ? "" : v); setPage(1) }
  const onActionChange = (v: string) => { setAction(v === "all" ? "" : v); setPage(1) }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Stage changes, resolutions, and escalations your team has made — plus changes to your
          company's supporter roster. Entries are permanent and cannot be edited or deleted.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="size-4 text-muted-foreground" />
        <Select value={entityType || "all"} onValueChange={onEntityChange}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {ENTITY_TYPES.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={action || "all"} onValueChange={onActionChange}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTION_PREFIXES.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilter && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
            <X className="size-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageLoader label="Loading activity" />
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ActivityIcon className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {hasFilter ? "No activity matches the selected filters." : "No activity yet."}
            </p>
            {hasFilter && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {items.map((a) => {
                const Icon = iconFor(a)
                const actorName = a.actor?.name || "System"
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm line-clamp-2">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{actorName}</span>
                        {" · "}
                        <span title={new Date(a.createdAt).toLocaleString()}>
                          {timeAgo(a.createdAt)}
                        </span>
                      </p>
                    </div>
                    <AuditSeverityBadge value={a.severity} />
                    {a.actor && (
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback className="text-[10px]">
                          {initials(a.actor.name) || "?"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

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
    </div>
  )
}

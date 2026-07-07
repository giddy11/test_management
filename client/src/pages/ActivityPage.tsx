import { useState } from "react"
import { Link } from "react-router-dom"
import {
  FolderKanban,
  Layers,
  ClipboardCheck,
  FlaskConical,
  CircleCheck,
  UserPlus,
  Users,
  FileUp,
  Activity as ActivityIcon,
  Filter,
  X,
  ChevronRight,
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
import { useActivity } from "@/hooks/useActivity"
import { useUsers } from "@/hooks/useUsers"
import { timeAgo } from "@/lib/timeAgo"
import type { ActivityLog } from "@/types/activity.types"

const ICONS: Record<string, LucideIcon> = {
  project: FolderKanban,
  suite: Layers,
  test_case: ClipboardCheck,
  test_run: FlaskConical,
  test_run_result: CircleCheck,
  user: Users,
}

function iconFor(a: ActivityLog): LucideIcon {
  if (a.action.startsWith("test_case.assigned")) return UserPlus
  if (a.action.startsWith("test_case.imported")) return FileUp
  return ICONS[a.entityType ?? ""] ?? ActivityIcon
}

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

function buildLink(a: ActivityLog): string | null {
  const m = a.metadata ?? {}
  const et = a.entityType
  const eid = a.entityId
  if (!eid) return null
  if (et === "project") return `/projects/${eid}`
  if (et === "test_run" && m.projectId) return `/projects/${m.projectId}/runs/${eid}`
  if (et === "test_run_result" && m.projectId && m.runId) return `/projects/${m.projectId}/runs/${m.runId}`
  if (et === "test_case" && m.projectId && m.suiteId) return `/projects/${m.projectId}/suites/${m.suiteId}/cases/${eid}`
  if (et === "suite" && m.projectId) return `/projects/${m.projectId}/suites/${eid}`
  return null
}

const ENTITY_TYPES = [
  { value: "project", label: "Projects" },
  { value: "suite", label: "Test Suites" },
  { value: "test_case", label: "Test Cases" },
  { value: "test_run", label: "Test Runs" },
  { value: "test_run_result", label: "Test Results" },
]

const ACTION_PREFIXES = [
  { value: "project", label: "Project actions" },
  { value: "suite", label: "Suite actions" },
  { value: "test_case", label: "Test case actions" },
  { value: "test_run", label: "Run actions" },
  { value: "result", label: "Result actions" },
]

export default function ActivityPage() {
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState<string>("")
  const [action, setAction] = useState<string>("")
  const [actorId, setActorId] = useState<string>("")

  const { data: usersData } = useUsers({ limit: 100 })
  const users = usersData?.data ?? []

  const { data, isLoading } = useActivity({
    page,
    limit: 30,
    entityType: entityType || undefined,
    action: action || undefined,
    actorId: actorId || undefined,
  })
  const items = data?.data ?? []
  const meta = data?.meta

  const hasFilter = Boolean(entityType || action || actorId)

  const clearFilters = () => {
    setEntityType("")
    setAction("")
    setActorId("")
    setPage(1)
  }

  const onEntityChange = (v: string) => { setEntityType(v === "all" ? "" : v); setPage(1) }
  const onActionChange = (v: string) => { setAction(v === "all" ? "" : v); setPage(1) }
  const onUserChange = (v: string) => { setActorId(v === "all" ? "" : v); setPage(1) }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="text-sm text-muted-foreground">Every action across your organisation.</p>
      </div>

      {/* Filters */}
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

        <Select value={actorId || "all"} onValueChange={onUserChange}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
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
                const link = buildLink(a)
                const inner = (
                  <>
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm line-clamp-2">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{actorName}</span>
                        {" · "}
                        {timeAgo(a.createdAt)}
                      </p>
                    </div>
                    {a.actor && (
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback className="text-[10px]">
                          {initials(a.actor.name) || "?"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {link && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                  </>
                )
                return link ? (
                  <li key={a.id}>
                    <Link
                      to={link}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      {inner}
                    </Link>
                  </li>
                ) : (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    {inner}
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

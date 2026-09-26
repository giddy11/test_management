// pages/ActivityPage.tsx — the organisation's audit trail.
//
// Append-only by construction: there is no edit or delete affordance here and
// no endpoint behind one. The API rejects writes to activity_logs at the
// database level, and the footer says so, because a log a reader believes can
// be quietly amended is not worth reading.
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  FolderKanban,
  Layers,
  ClipboardCheck,
  FlaskConical,
  CircleCheck,
  UserPlus,
  Users,
  FileUp,
  Bug,
  Lightbulb,
  MessageSquareHeart,
  Building2,
  ShieldCheck,
  Activity as ActivityIcon,
  Download,
  Search,
  X,
  ChevronRight,
  Lock,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { AuditSeverityBadge } from "@/components/shared/StatusBadge"
import { InlineLoader } from "@/components/shared/PageLoader"
import { useActivity, exportActivity } from "@/hooks/useActivity"
import { useUsers } from "@/hooks/useUsers"
import { useDebounce } from "@/hooks/useDebounce"
import { timeAgo } from "@/lib/timeAgo"
import {
  AUDIT_SEVERITIES,
  AUDIT_SEVERITY_META,
  AUDIT_RECORD_TYPES,
  AUDIT_ACTOR_ROLE_LABELS,
  type AuditSeverity,
} from "@/lib/enums"
import type { ActivityFilters, ActivityLog } from "@/types/activity.types"

const ICONS: Record<string, LucideIcon> = {
  project: FolderKanban,
  suite: Layers,
  test_case: ClipboardCheck,
  test_run: FlaskConical,
  test_run_result: CircleCheck,
  user: Users,
  bug: Bug,
  feature_request: Lightbulb,
  feedback: MessageSquareHeart,
  client_company: Building2,
  role: ShieldCheck,
}

function iconFor(a: ActivityLog): LucideIcon {
  if (a.action.startsWith("test_case.assigned")) return UserPlus
  if (a.action.startsWith("test_case.imported")) return FileUp
  return ICONS[a.entityType ?? ""] ?? ActivityIcon
}

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

const RECORD_TYPE_LABELS = Object.fromEntries(
  AUDIT_RECORD_TYPES.map((t) => [t.value, t.label.replace(/s$/, "")])
)

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
  if (et === "bug" && m.projectId) return `/projects/${m.projectId}/bugs/${eid}`
  if (et === "feature_request" && m.projectId) return `/projects/${m.projectId}/feature-requests/${eid}`
  return null
}

const ACTION_PREFIXES = [
  { value: "project", label: "Project actions" },
  { value: "suite", label: "Suite actions" },
  { value: "test_case", label: "Test case actions" },
  { value: "test_run", label: "Run actions" },
  { value: "result", label: "Result actions" },
  { value: "role", label: "Role & permission actions" },
  { value: "user", label: "Team member actions" },
]

const PAGE_SIZES = [10, 25, 50, 100]

export default function ActivityPage() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [searchInput, setSearchInput] = useState("")
  const [severity, setSeverity] = useState<AuditSeverity | "">("")
  const [entityType, setEntityType] = useState("")
  const [action, setAction] = useState("")
  const [actorId, setActorId] = useState("")
  const [exporting, setExporting] = useState(false)

  // Debounced so a search term costs one query rather than one per keystroke.
  const search = useDebounce(searchInput.trim(), 300)

  const { data: usersData } = useUsers({ limit: 100 })
  const users = usersData?.data ?? []

  const filters: ActivityFilters = useMemo(
    () => ({
      search: search || undefined,
      severity: severity || undefined,
      entityType: entityType || undefined,
      action: action || undefined,
      actorId: actorId || undefined,
    }),
    [search, severity, entityType, action, actorId]
  )

  const { data, isLoading, isError, error } = useActivity({ page, limit, ...filters })
  const items = data?.data ?? []
  const meta = data?.meta
  const total = meta?.total ?? 0

  const hasFilter = Boolean(search || severity || entityType || action || actorId)

  const clearFilters = () => {
    setSearchInput("")
    setSeverity("")
    setEntityType("")
    setAction("")
    setActorId("")
    setPage(1)
  }

  // Every filter resets to page 1 — page 7 of the unfiltered log is rarely page
  // 7 of the filtered one, and landing on an empty page reads as "no results".
  const onFilterChange =
    <T,>(set: (v: T) => void) =>
    (value: T) => {
      set(value)
      setPage(1)
    }

  const pickValue = (v: string) => (v === "all" ? "" : v)

  const onExport = async () => {
    setExporting(true)
    try {
      await exportActivity(filters)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  const firstRow = total === 0 ? 0 : (page - 1) * limit + 1
  const lastRow = Math.min(page * limit, total)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
          <p className="text-sm text-muted-foreground">
            Every action across your organisation. Entries are permanent — they cannot be
            edited or deleted from the app.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exporting || (!isLoading && items.length === 0)}
          data-cy="export-activity"
        >
          <Download className="mr-1 size-4" />
          {exporting ? "Exporting…" : "Export"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              setPage(1)
            }}
            placeholder="Search who, what, or which record"
            className="pl-8"
            data-cy="activity-search"
          />
        </div>

        <Select
          value={severity || "all"}
          onValueChange={onFilterChange((v: string) => setSeverity(pickValue(v) as AuditSeverity | ""))}
        >
          <SelectTrigger className="sm:w-[150px]"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {AUDIT_SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>{AUDIT_SEVERITY_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={entityType || "all"}
          onValueChange={onFilterChange((v: string) => setEntityType(pickValue(v)))}
        >
          <SelectTrigger className="sm:w-[170px]"><SelectValue placeholder="Record type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All record types</SelectItem>
            {AUDIT_RECORD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={action || "all"}
          onValueChange={onFilterChange((v: string) => setAction(pickValue(v)))}
        >
          <SelectTrigger className="sm:w-[190px]"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTION_PREFIXES.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={actorId || "all"}
          onValueChange={onFilterChange((v: string) => setActorId(pickValue(v)))}
        >
          <SelectTrigger className="sm:w-[170px]"><SelectValue placeholder="Who" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-3" /> Clear
          </Button>
        )}
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load the activity log"}
        </p>
      )}

      {!isError && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead className="w-56">Who</TableHead>
                <TableHead className="w-28">Severity</TableHead>
                <TableHead className="w-32">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={4} className="h-24"><InlineLoader /></TableCell></TableRow>
              )}
              {!isLoading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                    {hasFilter ? "No activity matches the selected filters." : "No activity yet."}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                items.map((a) => {
                  const Icon = iconFor(a)
                  const link = buildLink(a)
                  const actorName = a.actor?.name || "System"
                  const roleLabel = a.actor?.role
                    ? AUDIT_ACTOR_ROLE_LABELS[a.actor.role] ?? a.actor.role
                    : null
                  const subtitle = [RECORD_TYPE_LABELS[a.entityType ?? ""], a.action]
                    .filter(Boolean)
                    .join(" · ")

                  return (
                    <TableRow key={a.id} data-cy="activity-row">
                      <TableCell className="max-w-xl whitespace-normal">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Icon className="size-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium leading-snug">{a.summary}</p>
                            <p className="text-xs text-muted-foreground">
                              {subtitle}
                              {link && (
                                <Link
                                  to={link}
                                  className="ml-1 inline-flex items-center text-primary hover:underline"
                                >
                                  View <ChevronRight className="size-3" />
                                </Link>
                              )}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-7 shrink-0">
                            <AvatarFallback className="text-[10px]">
                              {initials(actorName) || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm">{actorName}</p>
                            {roleLabel && (
                              <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><AuditSeverityBadge value={a.severity} /></TableCell>
                      <TableCell
                        className="text-sm text-muted-foreground"
                        title={new Date(a.createdAt).toLocaleString()}
                      >
                        {timeAgo(a.createdAt)}
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {total === 0 ? "No entries" : `Showing ${firstRow}–${lastRow} of ${total}`}
          </span>
          <Select
            value={String(limit)}
            onValueChange={(v) => {
              setLimit(Number(v))
              setPage(1)
            }}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>{n} per page</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page}
            {meta?.totalPages ? ` of ${meta.totalPages}` : ""}
          </span>
          <Button variant="outline" size="sm" disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3 shrink-0" />
        This log is append-only. Entries are written as part of the change they describe and
        cannot be edited or removed — not by an administrator, and not by the app.
      </p>
    </div>
  )
}

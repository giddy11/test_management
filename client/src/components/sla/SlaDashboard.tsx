// components/sla/SlaDashboard.tsx — SLA tracking across tickets, bugs and
// feature requests: volume, response and resolution times, compliance/breaches,
// waiting issues, recurring issues, and per-severity / per-person breakdowns.
// Every figure is clickable and drills down to the issues behind it
// (SlaTicketsDialog) — all computed over the same filtered set, so the
// numbers always agree.
//
// Rendered inside the main dashboard (product-org roles) and the IT support
// portal (scoped server-side to the supporter's company).
import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Hourglass,
  Lightbulb,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Ticket,
  Timer,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageLoader } from "@/components/shared/PageLoader"
import { useSlaFilterOptions, useSlaOverview } from "@/hooks/useSla"
import { useDebounce } from "@/hooks/useDebounce"
import { useAuth } from "@/contexts/AuthContext"
import { FEEDBACK_TYPE_LABELS, type FeedbackType } from "@/types/feedback.types"
import {
  SLA_ALL_STAGES,
  SLA_SEVERITY_FILTER_LABELS,
  SLA_SOURCE_LABELS,
  fmtStage,
  type SlaFilters,
  type SlaInterval,
  type SlaPersonRow,
  type SlaSeverityFilter,
  type SlaSource,
  type SlaStage,
} from "@/types/sla.types"
import { ComplianceDonut, SeverityChart, SourceChart, StatusChart, TicketsOverTimeChart } from "./SlaCharts"
import { SlaTicketsDialog, type DrillDown } from "./SlaTicketsDialog"
import { SlaRulesDialog } from "./SlaRulesDialog"
import { RecurringIssues } from "./RecurringIssues"
import { daysAgo, fmtMs, fmtPct, rateTone } from "./slaFormat"

type RangePreset = "7d" | "30d" | "90d" | "365d" | "all" | "custom"

const RANGE_LABELS: Record<RangePreset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "365d": "Last 12 months",
  all: "All time",
  custom: "Custom range",
}

const SEVERITY_FILTERS: SlaSeverityFilter[] = ["critical", "high", "medium", "low", "unset"]

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  onClick,
  testId,
}: {
  icon: LucideIcon
  label: string
  value: string | number
  sub?: React.ReactNode
  tone?: string
  onClick?: () => void
  testId?: string
}) {
  const body = (
    <CardContent className="flex items-start gap-3 p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className={`text-2xl font-semibold leading-none tabular-nums ${tone ?? ""}`}>{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </div>
    </CardContent>
  )
  if (!onClick) return <Card data-cy={testId}>{body}</Card>
  return (
    <Card
      data-cy={testId}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
      title="Click to see these issues"
    >
      {body}
    </Card>
  )
}

function PeopleTable({
  rows,
  personLabel,
  emptyLabel,
  onSelect,
}: {
  rows: SlaPersonRow[]
  personLabel: string
  emptyLabel: string
  onSelect: (row: SlaPersonRow) => void
}) {
  if (rows.length === 0) return <p className="px-6 py-4 text-sm text-muted-foreground">{emptyLabel}</p>
  return (
    <div className="max-h-80 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{personLabel}</TableHead>
            <TableHead className="text-right">Issues</TableHead>
            <TableHead className="text-right">Open</TableHead>
            <TableHead className="text-right">Resolved</TableHead>
            <TableHead className="text-right">Breached</TableHead>
            <TableHead className="text-right">Avg response</TableHead>
            <TableHead className="text-right">Avg resolution</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const judged = r.met + r.breached
            const rate = judged > 0 ? (r.met / judged) * 100 : null
            return (
              <TableRow key={r.userId} className="cursor-pointer" onClick={() => onSelect(r)}>
                <TableCell>
                  <div className="font-medium">{r.name || "Unnamed"}</div>
                  {r.clientCompanyName && <div className="text-xs text-muted-foreground">{r.clientCompanyName}</div>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                <TableCell className="text-right tabular-nums">{r.open}</TableCell>
                <TableCell className="text-right tabular-nums">{r.resolved}</TableCell>
                <TableCell className="text-right">
                  <span className={`tabular-nums ${r.breached > 0 ? "text-red-600" : ""}`}>{r.breached}</span>
                  {rate != null && <span className={`ml-1 text-xs ${rateTone(rate)}`}>({fmtPct(rate)} met)</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMs(r.avgFirstResponseMs)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMs(r.avgResolutionMs)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function SlaDashboard() {
  const { user, can } = useAuth()
  // An external supporter is scoped to their own client company; the server
  // decides that from clientCompanyId, and so does this view.
  const isSupporter = Boolean(user?.clientCompanyId)
  const isAdmin = can("sla.configure")

  const [range, setRange] = useState<RangePreset>("90d")
  const [from, setFrom] = useState<string>(daysAgo(90))
  const [to, setTo] = useState<string>("")
  const [bucket, setBucket] = useState<SlaInterval | "auto">("auto")
  const [projectId, setProjectId] = useState("all")
  const [companyId, setCompanyId] = useState("all")
  const [status, setStatus] = useState("all")
  const [severity, setSeverity] = useState("all")
  const [type, setType] = useState("all")
  const [source, setSource] = useState("all")
  const [assigneeId, setAssigneeId] = useState("all")
  const [supporterId, setSupporterId] = useState("all")
  const [search, setSearch] = useState("")
  const [drill, setDrill] = useState<DrillDown | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  const applyRange = (preset: RangePreset) => {
    setRange(preset)
    if (preset === "all") {
      setFrom("")
      setTo("")
    } else if (preset !== "custom") {
      setFrom(daysAgo(Number(preset.replace("d", ""))))
      setTo("")
    }
  }

  const filters: SlaFilters = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      projectId: projectId === "all" ? undefined : projectId,
      clientCompanyId: companyId === "all" ? undefined : companyId,
      status: status === "all" ? undefined : (status as SlaStage),
      severity: severity === "all" ? undefined : (severity as SlaSeverityFilter),
      type: type === "all" ? undefined : (type as FeedbackType),
      source: source === "all" ? undefined : (source as SlaSource),
      assigneeId: assigneeId === "all" ? undefined : assigneeId,
      supporterId: supporterId === "all" ? undefined : supporterId,
      search: debouncedSearch || undefined,
      interval: bucket === "auto" ? undefined : bucket,
    }),
    [from, to, projectId, companyId, status, severity, type, source, assigneeId, supporterId, debouncedSearch, bucket]
  )

  const { data, isLoading, isError } = useSlaOverview(filters)
  const { data: options } = useSlaFilterOptions()

  // Supporters only ever see tickets (no Source filter for them), so the
  // ticket-only filters are always relevant to them.
  const ticketOnlyFilters = isSupporter || source === "ticket"

  const hasFilters =
    projectId !== "all" || companyId !== "all" || status !== "all" || severity !== "all" ||
    type !== "all" || source !== "all" || assigneeId !== "all" || supporterId !== "all" || search !== ""

  const clearFilters = () => {
    setProjectId("all"); setCompanyId("all"); setStatus("all"); setSeverity("all")
    setType("all"); setSource("all"); setAssigneeId("all"); setSupporterId("all"); setSearch("")
  }

  const k = data?.kpis

  return (
    <div className="space-y-6" data-cy="sla-dashboard">
      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => applyRange(v as RangePreset)}>
          <SelectTrigger className="w-40" data-cy="sla-range"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RANGE_LABELS) as RangePreset[]).map((p) => (
              <SelectItem key={p} value={p}>{RANGE_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {range === "custom" && (
          <>
            <Input type="date" className="w-40" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" className="w-40" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </>
        )}
        <Select value={bucket} onValueChange={(v) => setBucket(v as SlaInterval | "auto")}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto buckets</SelectItem>
            <SelectItem value="day">Daily</SelectItem>
            <SelectItem value="week">Weekly</SelectItem>
            <SelectItem value="month">Monthly</SelectItem>
            <SelectItem value="year">Yearly</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRulesOpen(true)} data-cy="sla-rules-button">
            <Settings2 className="size-4" /> SLA rules
            {data?.rules.isDefault && <Badge variant="secondary" className="ml-1">defaults</Badge>}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isSupporter && (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {(options?.projects ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!isSupporter && (options?.companies.length ?? 0) > 0 && (
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Client company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All client companies</SelectItem>
              {(options?.companies ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!isSupporter && (
          <Select
            value={source}
            onValueChange={(v) => {
              setSource(v)
              // The ticket-only filters are hidden unless Source is "Ticket", and
              // a hidden filter must not keep narrowing the results — clear them
              // on any switch away from tickets. Feature requests have no assignee.
              if (v !== "ticket") {
                setType("all"); setSupporterId("all")
              }
              if (v === "feature_request") setAssigneeId("all")
            }}
          >
            <SelectTrigger className="w-40" data-cy="sla-source"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {Object.entries(SLA_SOURCE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {SLA_ALL_STAGES.map((s) => <SelectItem key={s} value={s}>{fmtStage(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {SEVERITY_FILTERS.map((s) => <SelectItem key={s} value={s}>{SLA_SEVERITY_FILTER_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* A ticket's own category (bug / feature request / complaint) and IT-support
            routing only exist on tickets. They're offered only once Source is
            "Ticket" — otherwise a ticket category named "Bug" reads like the Bug
            source and silently hides every real bug. */}
        {ticketOnlyFilters && (
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-48">
              <SelectValue>
                {type === "all" ? "All ticket types" : `Ticket type: ${FEEDBACK_TYPE_LABELS[type as FeedbackType]}`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ticket types</SelectItem>
              {Object.entries(FEEDBACK_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!isSupporter && source !== "feature_request" && (options?.assignees.length ?? 0) > 0 && (
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All team members</SelectItem>
              {(options?.assignees ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {ticketOnlyFilters && (options?.supporters.length ?? 0) > 0 && (
          <Select value={supporterId} onValueChange={setSupporterId}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All support engineers</SelectItem>
              {(options?.supporters ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-72 pl-8"
            placeholder="Title, email, or TKT/BF/FR code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
      </div>

      {isLoading && !data && <PageLoader label="Crunching SLA figures" />}
      {isError && <p className="text-sm text-destructive">Couldn't load the SLA analytics.</p>}

      {data && k && (
        <>
          {/* ── KPI cards ─────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-cy="sla-kpis">
            <KpiCard
              icon={Ticket}
              label="Issues raised"
              value={k.total}
              sub={
                <span className="flex flex-wrap gap-x-2">
                  <span><Ticket className="inline size-3" /> {k.tickets} tickets</span>
                  <span><Bug className="inline size-3" /> {k.bugs} bugs</span>
                  <span><Lightbulb className="inline size-3" /> {k.featureRequests} features</span>
                </span>
              }
              onClick={() => setDrill({ metric: "all" })}
              testId="sla-kpi-total"
            />
            <KpiCard
              icon={CheckCircle2}
              label="Resolved"
              value={k.resolved}
              sub={`${k.closed} closed · ${k.total > 0 ? Math.round((k.resolved / k.total) * 100) : 0}% of raised`}
              onClick={() => setDrill({ metric: "resolved" })}
              testId="sla-kpi-resolved"
            />
            <KpiCard
              icon={Hourglass}
              label="Waiting / open"
              value={k.open}
              sub={k.open > 0 ? `avg wait ${fmtMs(k.avgWaitingMs)} · oldest ${fmtMs(k.oldestWaitingMs)}` : "Nothing waiting"}
              tone={k.open > 0 ? "text-yellow-600" : undefined}
              onClick={() => setDrill({ metric: "open", title: "Waiting issues" })}
              testId="sla-kpi-open"
            />
            <KpiCard
              icon={Clock}
              label="Awaiting first response"
              value={k.awaitingResponse}
              tone={k.awaitingResponse > 0 ? "text-red-600" : undefined}
              sub="Open issues nobody has picked up yet"
              onClick={() => setDrill({ metric: "awaiting_response" })}
              testId="sla-kpi-awaiting"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={Timer}
              label="First response time (avg)"
              value={fmtMs(k.avgFirstResponseMs)}
              sub={
                <>
                  median {fmtMs(k.medianFirstResponseMs)} ·{" "}
                  <span className={rateTone(k.firstResponseRate)}>{fmtPct(k.firstResponseRate)} on target</span>
                </>
              }
              onClick={() => setDrill({ metric: "first_response_breached" })}
              testId="sla-kpi-first-response"
            />
            <KpiCard
              icon={Timer}
              label="Resolution time (avg)"
              value={fmtMs(k.avgResolutionMs)}
              sub={
                <>
                  median {fmtMs(k.medianResolutionMs)} ·{" "}
                  <span className={rateTone(k.resolutionRate)}>{fmtPct(k.resolutionRate)} on target</span>
                  {(k.totalPausedMs ?? 0) > 0 && <> · {fmtMs(k.totalPausedMs)} paused</>}
                </>
              }
              onClick={() => setDrill({ metric: "resolution_breached" })}
              testId="sla-kpi-resolution"
            />
            <KpiCard
              icon={ShieldCheck}
              label="SLA compliance"
              value={fmtPct(k.complianceRate)}
              tone={rateTone(k.complianceRate)}
              sub={`${k.slaMet} met · ${k.slaBreached} breached · ${k.slaPending} within target`}
              onClick={() => setDrill({ metric: "judged" })}
              testId="sla-kpi-compliance"
            />
            <KpiCard
              icon={AlertTriangle}
              label="SLA breaches"
              value={k.slaBreached}
              tone={k.slaBreached > 0 ? "text-red-600" : "text-green-600"}
              sub={`${k.firstResponseBreached} response · ${k.resolutionBreached} resolution`}
              onClick={() => setDrill({ metric: "breached" })}
              testId="sla-kpi-breached"
            />
          </div>

          {/* ── Trend + compliance ────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Tickets, bugs &amp; feature requests over time</CardTitle>
                <CardDescription>
                  Issues raised per {data.interval}, by source, with resolutions overlaid
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TicketsOverTimeChart data={data.overTime} interval={data.interval} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SLA compliance</CardTitle>
                <CardDescription>Met vs breached across both response and resolution targets</CardDescription>
              </CardHeader>
              <CardContent>
                <ComplianceDonut kpis={k} onSelect={(seg) => setDrill({ metric: seg })} />
              </CardContent>
            </Card>
          </div>

          {/* ── Source + severity + status ───────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Issues by source</CardTitle>
                <CardDescription>Tickets, bugs, and feature requests, side by side</CardDescription>
              </CardHeader>
              <CardContent>
                <SourceChart
                  data={data.bySource}
                  onSelect={(src) =>
                    setDrill({ metric: "all", extra: { source: src }, title: `${SLA_SOURCE_LABELS[src]} issues` })
                  }
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Issues by severity</CardTitle>
                <CardDescription>
                  Tickets: severity set by IT support on escalation · bugs: from priority · features: none.
                  Targets for each are under SLA rules.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SeverityChart
                  data={data.bySeverity}
                  onSelect={(sev) =>
                    setDrill({ metric: "all", extra: { severity: sev }, title: `${SLA_SEVERITY_FILTER_LABELS[sev]} severity issues` })
                  }
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Issues by status</CardTitle>
                <CardDescription>Where issues currently sit in their workflow</CardDescription>
              </CardHeader>
              <CardContent>
                <StatusChart
                  data={data.byStatus}
                  onSelect={(st) => setDrill({ metric: "all", extra: { status: st }, title: `${fmtStage(st)} issues` })}
                />
              </CardContent>
            </Card>
          </div>

          {/* ── Most recurring issues ─────────────────────────────────────── */}
          <RecurringIssues
            rows={data.recurring}
            canOpen={!isSupporter}
            onSelect={(r) =>
              setDrill({
                metric: "all",
                // The key alone identifies the group; the page's own filters still apply.
                extra: { recurringKey: r.groupKey },
                title: `"${r.title}" — ${r.count} ${r.source === "feature_request" ? "requests" : "reports"}`,
              })
            }
          />

          {/* ── By product ────────────────────────────────────────────────── */}
          <div className="grid gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Star className="size-4 text-yellow-500" />
                <div>
                  <CardTitle className="text-base">By product</CardTitle>
                  <CardDescription>
                    Submitter satisfaction: {k.ratingCount > 0 ? `${(k.avgRating ?? 0).toFixed(1)} / 5 from ${k.ratingCount} ratings` : "no ratings yet"}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.byProject.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-muted-foreground">No issues yet.</p>
                ) : (
                  <div className="max-h-80 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Issues</TableHead>
                          <TableHead className="text-right">Open</TableHead>
                          <TableHead className="text-right">Breached</TableHead>
                          <TableHead className="text-right">Avg resolution</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byProject.map((p) => (
                          <TableRow
                            key={p.projectId}
                            className="cursor-pointer"
                            onClick={() => setDrill({ metric: "all", extra: { projectId: p.projectId }, title: `${p.projectName} issues` })}
                          >
                            <TableCell className="font-medium">{p.projectName}</TableCell>
                            <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                            <TableCell className="text-right tabular-nums">{p.open}</TableCell>
                            <TableCell className="text-right">
                              <span className={`tabular-nums ${p.breached > 0 ? "text-red-600" : ""}`}>{p.breached}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{fmtMs(p.avgResolutionMs)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── People ────────────────────────────────────────────────────── */}
          <div className={`grid gap-4 ${isSupporter ? "" : "lg:grid-cols-2"}`}>
            {!isSupporter && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By team member</CardTitle>
                  <CardDescription>Product-team assignees (tickets and bugs) — an issue with two assignees counts for both</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <PeopleTable
                    rows={data.byAssignee}
                    personLabel="Team member"
                    emptyLabel="No assigned issues in this range."
                    onSelect={(r) => setDrill({ metric: "all", extra: { assigneeId: r.userId }, title: `Issues assigned to ${r.name}` })}
                  />
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By support engineer</CardTitle>
                <CardDescription>IT support engineers and the tickets routed to them — unassigned tickets aren't counted against anyone</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <PeopleTable
                  rows={data.bySupporter}
                  personLabel="Support engineer"
                  emptyLabel="No support engineers to show."
                  onSelect={(r) => setDrill({ metric: "all", extra: { supporterId: r.userId }, title: `Tickets handled by ${r.name}` })}
                />
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Covers tickets, bugs, and feature requests. Times are measured from issue creation. Open issues
            are judged against their live clock, so breaches appear automatically as targets pass. Date
            range applies to when issues were raised; historical issues stay available for as long as they
            exist.
            {isAdmin && " Change the targets under SLA rules."}
          </p>
        </>
      )}

      <SlaTicketsDialog drill={drill} filters={filters} onOpenChange={(o) => !o && setDrill(null)} />
      <SlaRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  )
}

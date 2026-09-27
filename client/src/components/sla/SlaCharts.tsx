// components/sla/SlaCharts.tsx — recharts views for the SLA dashboard.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { SLA_COLORS, fmtMs } from "./slaFormat"
import {
  SLA_SEVERITY_FILTER_LABELS,
  SLA_SOURCE_LABELS,
  SLA_STAGE_LABELS,
  type SlaInterval,
  type SlaKpis,
  type SlaOverTimePoint,
  type SlaSeverityRow,
  type SlaSourceRow,
  type SlaStatusRow,
} from "@/types/sla.types"

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
}

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" }

function EmptyChart({ label, height = 240 }: { label: string; height?: number }) {
  return (
    <div style={{ height }} className="flex items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  )
}

function periodLabel(period: string, interval: SlaInterval): string {
  const d = new Date(`${period}T00:00:00`)
  if (interval === "year") return d.toLocaleDateString(undefined, { year: "numeric" })
  if (interval === "month") return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

// Issues raised per period, stacked by source (ticket/bug/feature request),
// with resolutions as a line so intake and throughput can be read against
// each other.
export function TicketsOverTimeChart({
  data,
  interval,
}: {
  data: SlaOverTimePoint[]
  interval: SlaInterval
}) {
  if (data.length === 0) return <EmptyChart label="Nothing in this range" />
  const rows = data.map((p) => ({ ...p, label: periodLabel(p.period, interval) }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="tickets" name="Tickets" stackId="raised" fill={SLA_COLORS.ticket} radius={[0, 0, 0, 0]} />
        <Bar dataKey="bugs" name="Bugs" stackId="raised" fill={SLA_COLORS.bug} />
        <Bar dataKey="featureRequests" name="Feature requests" stackId="raised" fill={SLA_COLORS.featureRequest} radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="resolved"
          name="Resolved"
          stroke={SLA_COLORS.resolved}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// Volume/compliance split by top-level source — the view that answers
// "does this cover bugs and feature requests, not just tickets".
export function SourceChart({
  data,
  onSelect,
}: {
  data: SlaSourceRow[]
  onSelect?: (source: SlaSourceRow["source"]) => void
}) {
  if (data.length === 0) return <EmptyChart label="Nothing yet" />
  const rows = data.map((r) => ({ ...r, label: SLA_SOURCE_LABELS[r.source] }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={10}>
        <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={90} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value, _name, item) => {
            const row = item.payload as SlaSourceRow
            return [`${value} total · ${row.breached} breached · avg resolution ${fmtMs(row.avgResolutionMs)}`, "Issues"]
          }}
        />
        <Bar
          dataKey="total"
          name="Issues"
          radius={[0, 6, 6, 0]}
          onClick={(d) => onSelect?.((d as unknown as SlaSourceRow).source)}
          className={onSelect ? "cursor-pointer" : undefined}
        >
          {rows.map((r) => <Cell key={r.source} fill={SLA_COLORS[r.source === "feature_request" ? "featureRequest" : r.source]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// Met / breached / still-within-target split, with a legend of counts.
export function ComplianceDonut({
  kpis,
  onSelect,
}: {
  kpis: SlaKpis
  onSelect?: (segment: "compliant" | "breached" | "pending") => void
}) {
  const segments = [
    { key: "compliant" as const, name: "SLA met", value: kpis.slaMet, color: SLA_COLORS.met },
    { key: "breached" as const, name: "SLA breached", value: kpis.slaBreached, color: SLA_COLORS.breached },
    { key: "pending" as const, name: "Within SLA (open)", value: kpis.slaPending, color: SLA_COLORS.pending },
  ]
  const total = kpis.total
  if (total === 0) return <EmptyChart label="No tickets to judge yet" height={200} />

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={78}
            paddingAngle={2}
            strokeWidth={0}
            onClick={(_, index) => onSelect?.(segments[index].key)}
            className={onSelect ? "cursor-pointer" : undefined}
          >
            {segments.map((s) => <Cell key={s.key} fill={s.color} />)}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              const n = Number(value)
              return [`${n} (${Math.round((n / total) * 100)}%)`, String(name)]
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5 px-1">
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect?.(s.key)}
            className="flex w-full items-center gap-1.5 rounded px-1 text-left text-xs hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
            disabled={!onSelect}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.name}</span>
            <span className="ml-auto font-medium tabular-nums">
              {s.value} <span className="text-muted-foreground">({Math.round((s.value / total) * 100)}%)</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Stacked met/breached/pending per severity — the "issues by severity" view.
export function SeverityChart({
  data,
  onSelect,
}: {
  data: SlaSeverityRow[]
  onSelect?: (severity: SlaSeverityRow["severity"]) => void
}) {
  if (data.length === 0) return <EmptyChart label="No tickets yet" />
  const rows = data.map((r) => ({
    ...r,
    label: SLA_SEVERITY_FILTER_LABELS[r.severity],
  }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={10}>
        <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={76} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value, name, item) => {
            const row = item.payload as SlaSeverityRow
            if (name === "SLA met") return [`${value} · avg resolution ${fmtMs(row.avgResolutionMs)}`, name]
            return [value, name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="met" name="SLA met" stackId="a" fill={SLA_COLORS.met} onClick={(d) => onSelect?.((d as unknown as SlaSeverityRow).severity)} className={onSelect ? "cursor-pointer" : undefined} />
        <Bar dataKey="breached" name="Breached" stackId="a" fill={SLA_COLORS.breached} onClick={(d) => onSelect?.((d as unknown as SlaSeverityRow).severity)} className={onSelect ? "cursor-pointer" : undefined} />
        <Bar dataKey="pending" name="Within SLA" stackId="a" fill={SLA_COLORS.pending} radius={[0, 4, 4, 0]} onClick={(d) => onSelect?.((d as unknown as SlaSeverityRow).severity)} className={onSelect ? "cursor-pointer" : undefined} />
      </BarChart>
    </ResponsiveContainer>
  )
}

const STAGE_PALETTE = ["#ef4444", "#f59e0b", "#0ea5e9", "#6366f1", "#a855f7", "#22c55e", "#64748b"]

export function StatusChart({
  data,
  onSelect,
}: {
  data: SlaStatusRow[]
  onSelect?: (status: SlaStatusRow["status"]) => void
}) {
  if (data.length === 0) return <EmptyChart label="No tickets yet" />
  const rows = data.map((r) => ({ ...r, label: SLA_STAGE_LABELS[r.status] ?? r.status }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={90} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value, _name, item) => {
            const row = item.payload as SlaStatusRow
            return [`${value} (${row.breached} breached)`, "Tickets"]
          }}
        />
        <Bar
          dataKey="count"
          name="Tickets"
          radius={[0, 6, 6, 0]}
          onClick={(d) => onSelect?.((d as unknown as SlaStatusRow).status)}
          className={onSelect ? "cursor-pointer" : undefined}
        >
          {rows.map((_, i) => <Cell key={i} fill={STAGE_PALETTE[i % STAGE_PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

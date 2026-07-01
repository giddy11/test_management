import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { RESULT_META } from "@/lib/enums"
import type { DashboardOverview, Distribution } from "@/types/testMgmt.types"

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
}

const BAR_PALETTE = ["#6366f1", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7"]

const RESULT_KEYS = ["pass", "fail", "blocked", "skipped", "pending"] as const

// Donut of run result outcomes with a legend showing counts for all categories.
export function ResultDonut({ breakdown }: { breakdown: DashboardOverview["resultBreakdown"] }) {
  // Always include all segments — recharts simply won't draw a 0-value arc,
  // but having them in the data keeps the tooltip and colours consistent.
  const segments = RESULT_KEYS.map((k) => ({
    key: k,
    name: RESULT_META[k].label,
    value: breakdown[k],
    color: RESULT_META[k].color,
  }))

  if (breakdown.total === 0) {
    return <EmptyChart label="No results recorded yet" />
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={segments}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={84}
            paddingAngle={2}
            strokeWidth={0}
          >
            {segments.map((d) => <Cell key={d.key} fill={d.color} />)}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => {
              const n = Number(value)
              return [`${n} (${breakdown.total > 0 ? Math.round((n / breakdown.total) * 100) : 0}%)`, String(name)]
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend — shows all 5 categories so users can see what's counted */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1 sm:grid-cols-3">
        {RESULT_KEYS.map((k) => {
          const count = breakdown[k]
          const pct = breakdown.total > 0 ? Math.round((count / breakdown.total) * 100) : 0
          return (
            <div key={k} className="flex items-center gap-1.5 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: RESULT_META[k].color }}
              />
              <span className="text-muted-foreground">{RESULT_META[k].label}</span>
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {count} <span className="text-muted-foreground">({pct}%)</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Horizontal bars for a label/count distribution (case status or priority).
export function DistributionBars({ data }: { data: Distribution[] }) {
  if (!data.length) return <EmptyChart label="No test cases yet" />
  const rows = data.map((d) => ({ name: d.key, count: d.count }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
        <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
          {rows.map((_, i) => <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  )
}

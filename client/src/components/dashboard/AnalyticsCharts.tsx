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

// Donut of run result outcomes.
export function ResultDonut({ breakdown }: { breakdown: DashboardOverview["resultBreakdown"] }) {
  const data = (["pass", "fail", "blocked", "skipped", "pending"] as const)
    .map((k) => ({ name: RESULT_META[k].label, value: breakdown[k], color: RESULT_META[k].color }))
    .filter((d) => d.value > 0)

  if (breakdown.total === 0) {
    return <EmptyChart label="No results recorded yet" />
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} strokeWidth={0}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
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

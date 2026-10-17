// pages/serviceDesk/ServiceReportsPage.tsx — servicedesk.report. How IT
// requests are going: where things stand right now, and how the chosen period
// went (throughput, approval and fulfilment times, on-time rate, escalations),
// with breakdowns by category and person and the longest-overdue requests.
// Headline numbers are stat tiles; breakdowns are tables — no chart earns its
// place here (see the dataviz guidance: "the number is the chart").
import { useState } from "react"
import { Link } from "react-router-dom"
import { AlarmClock, BarChart3 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DueText, ModuleOffNotice, RequestStatusBadge } from "@/components/serviceDesk/RequestBits"
import { useServiceDeskReport, useServiceDeskSettings } from "@/hooks/useServiceDesk"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"
import { cn } from "@/lib/utils"

const RANGES = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months" } as const
type RangeKey = keyof typeof RANGES

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
const hours = (h: number | null) => (h === null ? "—" : h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`)
const percent = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`)

export default function ServiceReportsPage() {
  const { permissions } = useAuth()
  const { data: settings, isLoading: loadingSettings } = useServiceDeskSettings()
  const enabled = Boolean(settings?.enabled)
  const [range, setRange] = useState<RangeKey>("30")
  const to = new Date()
  const from = new Date(to.getTime() - (Number(range) - 1) * 86_400_000)
  const { data, isLoading } = useServiceDeskReport({ from: isoDay(from), to: isoDay(to) }, enabled)

  if (loadingSettings) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 className="size-6 text-primary" /> IT request reports
          </h1>
          <p className="text-sm text-muted-foreground">Pending work, overdue approvals and fulfilment, and service-level performance.</p>
        </div>
        {enabled && (
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(RANGES).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!enabled ? (
        <ModuleOffNotice canManage={can(permissions, "servicedesk.manage")} />
      ) : isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Crunching the numbers…</p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Right now</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Stat label="Open requests" value={compact(data.now.open)} />
              <Stat label="Waiting for approval" value={compact(data.now.pendingApproval)} />
              <Stat label="Approvals overdue" value={compact(data.now.overdueApproval)} alarm={data.now.overdueApproval > 0} />
              <Stat label="Ready for IT" value={compact(data.now.readyForIt)} />
              <Stat label="Fulfilment overdue" value={compact(data.now.overdueFulfilment)} alarm={data.now.overdueFulfilment > 0} />
              <Stat label="Waiting on requester" value={compact(data.now.waitingOnRequester)} />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{RANGES[range]}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Stat label="Submitted" value={compact(data.throughput.submitted)} />
              <Stat label="Fulfilled" value={compact(data.throughput.fulfilled)} />
              <Stat
                label="Fulfilled on time"
                value={percent(data.throughput.onTimeRate)}
                hint={data.throughput.fulfilledWithTarget ? `${data.throughput.fulfilledOnTime} of ${data.throughput.fulfilledWithTarget}` : "Nothing fulfilled yet"}
              />
              <Stat label="Average approval time" value={hours(data.throughput.avgApprovalHours)} hint="Submitted to fully approved" />
              <Stat label="Average fulfilment time" value={hours(data.throughput.avgFulfilmentHours)} hint="Reaching IT to fulfilled" />
              <Stat
                label="Escalations sent"
                value={compact(
                  Object.values(data.escalations).reduce((s, e) => s + e.level1 + e.level2 + e.level3, 0)
                )}
                hint={`${data.escalations.approval.level3 + data.escalations.fulfilment.level3} critical`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Also {data.throughput.rejected} rejected and {data.throughput.cancelled} cancelled in this period.
            </p>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By category</CardTitle>
                <CardDescription>Submitted and fulfilled in the period; open counts are right now.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Submitted</TableHead>
                      <TableHead className="text-right">Fulfilled</TableHead>
                      <TableHead className="text-right">Late</TableHead>
                      <TableHead className="text-right">Avg. time</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byCategory.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No requests in this period.</TableCell></TableRow>
                    )}
                    {data.byCategory.map((c) => (
                      <TableRow key={c.category}>
                        <TableCell className="font-medium">{c.category || "Uncategorised"}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.submitted}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.fulfilled}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", c.fulfilledLate > 0 && "font-medium")}>{c.fulfilledLate}</TableCell>
                        <TableCell className="text-right tabular-nums">{hours(c.avgFulfilmentHours)}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.open}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">By person</CardTitle>
                <CardDescription>Who fulfilled what, and what they're working on now.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead className="text-right">Fulfilled</TableHead>
                      <TableHead className="text-right">In progress</TableHead>
                      <TableHead className="text-right">Avg. work time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byAssignee.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Nobody has worked a request in this period.</TableCell></TableRow>
                    )}
                    {data.byAssignee.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.fulfilled}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.inProgress}</TableCell>
                        <TableCell className="text-right tabular-nums">{hours(a.avgWorkHours)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-base"><AlarmClock className="size-4" /> Longest overdue</CardTitle>
              <CardDescription>Past their approval or fulfilment target right now, most overdue first.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>With</TableHead>
                    <TableHead className="text-right">Late by</TableHead>
                    <TableHead className="text-right">Escalation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.overdue.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Nothing is overdue.</TableCell></TableRow>
                  )}
                  {data.overdue.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link to={`/requests/${o.id}`} className="hover:underline">
                          <span className="font-mono text-xs text-muted-foreground">{o.reference}</span> {o.title}
                        </Link>
                      </TableCell>
                      <TableCell><RequestStatusBadge value={o.status} /></TableCell>
                      <TableCell className="text-sm">{o.phase === "approval" ? "Approvers" : o.assigneeName ?? "Unassigned"}</TableCell>
                      <TableCell className="text-right"><DueText at={o.dueAt} /></TableCell>
                      <TableCell className="text-right tabular-nums">{o.escalationLevel ? `Level ${o.escalationLevel} of 3` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// Stat tile: label, value, optional hint. An alarm adds an icon and the word
// "attention" for screen readers — never colour alone.
function Stat({ label, value, hint, alarm }: { label: string; value: string; hint?: string; alarm?: boolean }) {
  return (
    <Card className={cn(alarm && "border-red-300 dark:border-red-900")}>
      <CardContent className="space-y-1 py-4">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {alarm && <AlarmClock className="size-3 text-red-600" aria-label="Needs attention" />}
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

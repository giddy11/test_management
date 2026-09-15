// components/sla/SlaTicketsDialog.tsx — drill-down from a dashboard figure to
// the tickets behind it, with each ticket's SLA readings. Product-org users
// can jump straight to the ticket in "All tickets"; IT supporters see the
// same list (their queue is tabbed by stage, so no deep link).
import { useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, PauseCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { useSlaTickets } from "@/hooks/useSla"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"
import { FEEDBACK_SEVERITY_LABELS, FEEDBACK_TYPE_LABELS } from "@/types/feedback.types"
import {
  SLA_METRIC_LABELS,
  SLA_SOURCE_LABELS,
  fmtStage,
  type SlaFilters,
  type SlaMetric,
  type SlaTicket,
  type SlaTicketsParams,
} from "@/types/sla.types"
import { fmtMs } from "./slaFormat"

export interface DrillDown {
  metric: SlaMetric
  // Extra narrowing on top of the page filters (e.g. a severity bar click).
  extra?: Partial<SlaFilters>
  title?: string
}

// Where a row's own detail page lives — tickets go through the all-tickets
// search, bugs/feature requests have a direct by-code route.
function issueLink(t: SlaTicket): string {
  if (t.source === "bug") return `/projects/${t.projectId}/bugs/ref/${t.referenceCode}`
  if (t.source === "feature_request") return `/projects/${t.projectId}/feature-requests/ref/${t.referenceCode}`
  return `/all-feedback?q=${encodeURIComponent(t.referenceCode)}`
}

function ComplianceBadge({ t }: { t: SlaTicket }) {
  if (t.compliance === "breached") {
    const which = [t.firstResponseBreached && "response", t.resolutionBreached && "resolution"]
      .filter(Boolean)
      .join(" + ")
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" /> Breached ({which})
      </Badge>
    )
  }
  if (t.compliance === "met") {
    return (
      <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600">
        <CheckCircle2 className="size-3" /> Met
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="size-3" /> Within SLA
    </Badge>
  )
}

// "3h 20m / 4h" — measured against target; for open tickets the live clock.
function Reading({
  measuredMs,
  liveMs,
  targetMs,
  breached,
  done,
}: {
  measuredMs: number | null
  liveMs: number
  targetMs: number
  breached: boolean
  done: boolean
}) {
  const shown = measuredMs ?? liveMs
  return (
    <span className={`tabular-nums ${breached ? "text-red-600" : done ? "text-green-600" : ""}`}>
      {fmtMs(shown)}
      <span className="text-muted-foreground"> / {fmtMs(targetMs)}</span>
      {!done && <span className="ml-1 text-xs text-muted-foreground">(ongoing)</span>}
    </span>
  )
}

export function SlaTicketsDialog({
  drill,
  filters,
  onOpenChange,
}: {
  drill: DrillDown | null
  filters: SlaFilters
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const isSupporter = user?.role === UserRole.IT_SUPPORT
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SlaTicketsParams["sort"]>("newest")

  const params: SlaTicketsParams = {
    ...filters,
    ...(drill?.extra ?? {}),
    metric: drill?.metric ?? "all",
    sort,
    page,
    limit: 20,
  }
  delete (params as { interval?: string }).interval
  const { data, isLoading } = useSlaTickets(params, Boolean(drill))
  const rows = data?.data ?? []
  const meta = data?.meta

  return (
    <Dialog
      open={Boolean(drill)}
      onOpenChange={(o) => {
        if (!o) setPage(1)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{drill?.title ?? (drill ? SLA_METRIC_LABELS[drill.metric] : "Issues")}</DialogTitle>
          <DialogDescription>
            {meta?.total != null && meta.total > 0
              ? `${meta.total} issue${meta.total === 1 ? "" : "s"} match the current filters.`
              : "Issues matching the current dashboard filters."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <Select value={sort} onValueChange={(v) => { setSort(v as SlaTicketsParams["sort"]); setPage(1) }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="longest_waiting">Longest waiting</SelectItem>
            </SelectContent>
          </Select>
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Page {meta.page} of {meta.totalPages}
              <Button size="sm" variant="outline" disabled={!meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={!meta.hasNext} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>

        {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading issues…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No issues match.</p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>First response</TableHead>
                  <TableHead>Resolution</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-[280px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{t.referenceCode}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {t.type ? FEEDBACK_TYPE_LABELS[t.type] : SLA_SOURCE_LABELS[t.source]}
                        </Badge>
                      </div>
                      <div className="truncate text-sm font-medium" title={t.title}>{t.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {t.projectName}
                        {t.clientCompanyName && <> · via {t.clientCompanyName} IT</>}
                        {t.assignees.length > 0 && <> · {t.assignees.join(", ")}</>}
                        {t.supporterName && <> · {t.supporterName}</>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{fmtStage(t.stage)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.severity ? FEEDBACK_SEVERITY_LABELS[t.severity] : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Reading
                        measuredMs={t.firstResponseMs}
                        liveMs={t.ageMs}
                        targetMs={t.firstResponseTargetMs}
                        breached={t.firstResponseBreached}
                        done={t.firstResponseAt != null}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      <Reading
                        measuredMs={t.resolutionMs}
                        liveMs={Math.max(0, t.ageMs - t.pausedMs)}
                        targetMs={t.resolutionTargetMs}
                        breached={t.resolutionBreached}
                        done={t.isResolved}
                      />
                      {t.pausedMs > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <PauseCircle className="size-3" /> {fmtMs(t.pausedMs)} paused
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {t.isResolved ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {fmtMs(t.ageMs)}
                          <div className="text-xs text-muted-foreground">{fmtMs(t.sinceUpdateMs)} since update</div>
                        </>
                      )}
                    </TableCell>
                    <TableCell><ComplianceBadge t={t} /></TableCell>
                    <TableCell>
                      {!isSupporter && t.visibleInTriage && (
                        <Link
                          to={issueLink(t)}
                          title={t.source === "ticket" ? "Open in All tickets" : "Open"}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-4" />
                        </Link>
                      )}
                      {!isSupporter && !t.visibleInTriage && (
                        <span className="text-[10px] text-muted-foreground" title="Still in the client company's IT queue">
                          IT queue
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

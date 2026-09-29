// components/sla/RecurringIssues.tsx — the SLA dashboard's "Most recurring issues":
// the bug, ticket and feature request that keep being raised, so an admin can see
// what deserves planning time. Groups come from the reports the team linked as
// repeats (so differently-worded reports count together), plus identical titles.
//
// Each row carries the signals that decide what to do about it — still open?
// filed again after it was fixed? how many votes? — and turns them into one line
// of plain advice. Clicking anything opens the group's reports (SlaTicketsDialog).
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Bug, ExternalLink, Lightbulb, Link2, Repeat, Ticket, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ticketPath } from "@/lib/ticketLinks"
import type { SlaRecurringRow, SlaSource } from "@/types/sla.types"
import { fmtMs } from "./slaFormat"

interface Kind {
  source: SlaSource
  // Tab label, and the label above the headline tile.
  tab: string
  tile: string
  // What one occurrence is called: "3 reports" / "3 requests".
  noun: string
  icon: LucideIcon
  // What the kind is called in "No … has been raised more than once".
  empty: string
}

const KINDS: Kind[] = [
  { source: "bug", tab: "Bugs", tile: "Most reported bug", noun: "report", icon: Bug, empty: "bug" },
  { source: "ticket", tab: "Tickets", tile: "Most reported ticket", noun: "report", icon: Ticket, empty: "ticket" },
  {
    source: "feature_request",
    tab: "Feature requests",
    tile: "Most requested feature",
    noun: "request",
    icon: Lightbulb,
    empty: "feature request",
  },
]

type Tone = "danger" | "warn" | "ok"

const TONE_BADGE: Record<Tone, string> = {
  danger: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

// The plain-language reading of a group: how urgent it is, in a word, and what
// that suggests doing. Ordered by how much it should worry someone — a problem
// that has already been fixed once and returned outranks one that is merely open.
function recurringFocus(r: SlaRecurringRow): { tone: Tone; label: string; advice: string } {
  const isFeature = r.source === "feature_request"
  const noun = isFeature ? "request" : "report"

  if (r.afterFix > 0) {
    return isFeature
      ? {
          tone: "danger",
          label: "Asked for again",
          advice: `${plural(r.afterFix, "request")} came in after it was closed out — check it does what people need.`,
        }
      : {
          tone: "danger",
          label: "Came back after a fix",
          advice: `${r.afterFix} of ${r.count} ${noun}s were filed after it had been fixed — the fix may not have reached the root cause.`,
        }
  }
  if (r.open > 0) {
    return isFeature
      ? {
          tone: "warn",
          label: "Not delivered yet",
          advice: `Requested ${r.count} times${r.votes ? ` with ${plural(r.votes, "vote")}` : ""} and still open — a candidate for the roadmap.`,
        }
      : {
          tone: "warn",
          label: "Still open",
          advice: `${r.open} of ${r.count} ${noun}s are still open — a strong candidate to prioritise.`,
        }
  }
  return {
    tone: "ok",
    label: isFeature ? "Closed out" : "Resolved",
    advice: isFeature
      ? `All ${r.count} requests are closed out. No action needed.`
      : `All ${r.count} ${noun}s are resolved. Keep an eye out in case it returns.`,
  }
}

function FocusBadge({ row }: { row: SlaRecurringRow }) {
  const focus = recurringFocus(row)
  return (
    <Badge variant="outline" className={`text-[10px] ${TONE_BADGE[focus.tone]}`} data-cy="recurring-focus">
      {focus.label}
    </Badge>
  )
}

// Where the group's own ticket opens — the original, or its earliest report.
function openPath(r: SlaRecurringRow): string {
  const type = r.ticketSource === "ticket" ? "feedback" : r.ticketSource
  return ticketPath({ type, id: r.ticketId, projectId: r.projectId, referenceCode: r.referenceCode })
}

function TopTile({ kind, row, onSelect }: { kind: Kind; row?: SlaRecurringRow; onSelect: (r: SlaRecurringRow) => void }) {
  const Icon = kind.icon
  if (!row) {
    return (
      <div
        className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
        data-cy={`recurring-top-${kind.source}`}
      >
        <div className="mb-2 flex items-center gap-2 text-xs">
          <Icon className="size-4" /> {kind.tile}
        </div>
        No {kind.empty} has been raised more than once in this range.
      </div>
    )
  }
  const focus = recurringFocus(row)
  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className="rounded-lg border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
      title="Click to see every report"
      data-cy={`recurring-top-${kind.source}`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 text-primary" /> {kind.tile}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug" title={row.title}>
        {row.title}
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums" data-cy="recurring-top-count">{row.count}</span>
        <span className="text-xs text-muted-foreground">
          {kind.noun}s{row.votes ? ` · ${plural(row.votes, "vote")}` : ""}
        </span>
        <Badge variant="outline" className={`ml-auto text-[10px] ${TONE_BADGE[focus.tone]}`}>{focus.label}</Badge>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground" data-cy="recurring-advice">
        {focus.advice}
      </p>
    </button>
  )
}

interface Props {
  rows: SlaRecurringRow[]
  // Whether the viewer may open the tickets themselves — an external supporter
  // sees the numbers but has no way into the product organisation's pages.
  canOpen: boolean
  onSelect: (row: SlaRecurringRow) => void
}

export function RecurringIssues({ rows, canOpen, onSelect }: Props) {
  // The server returns each kind ranked; keep that order.
  const byKind = useMemo(() => {
    const map: Record<SlaSource, SlaRecurringRow[]> = { bug: [], ticket: [], feature_request: [] }
    for (const r of rows) map[r.source]?.push(r)
    return map
  }, [rows])

  // Open on whichever kind has the biggest offender.
  const busiest = useMemo(
    () =>
      KINDS.reduce((best, k) => ((byKind[k.source][0]?.count ?? 0) > (byKind[best.source][0]?.count ?? 0) ? k : best), KINDS[0])
        .source,
    [byKind]
  )
  const [picked, setPicked] = useState<SlaSource | null>(null)
  const tab = picked ?? busiest

  return (
    <Card data-cy="recurring-issues">
      <CardHeader className="flex flex-row items-start gap-2">
        <Repeat className="mt-1 size-4 text-primary" />
        <div>
          <CardTitle className="text-base">Most recurring issues</CardTitle>
          <CardDescription>
            What keeps coming back, to help decide what to fix or build first. Reports your team linked as repeats
            count together, however they were worded; identical titles are grouped automatically.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {KINDS.map((k) => (
            <TopTile key={k.source} kind={k} row={byKind[k.source][0]} onSelect={onSelect} />
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-cy="recurring-empty">
            Nothing has been raised more than once in this range.
          </p>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setPicked(v as SlaSource)}>
            <TabsList>
              {KINDS.map((k) => (
                <TabsTrigger key={k.source} value={k.source} data-cy={`recurring-tab-${k.source}`}>
                  {k.tab}
                  <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums">
                    {byKind[k.source].length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {KINDS.map((k) => {
              const list = byKind[k.source]
              const showVotes = k.source === "feature_request"
              return (
                <TabsContent key={k.source} value={k.source}>
                  {list.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">
                      No {k.empty} has been raised more than once in this range.
                    </p>
                  ) : (
                    <div className="max-h-96 overflow-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Issue</TableHead>
                            <TableHead className="text-right">{k.noun === "request" ? "Requests" : "Reports"}</TableHead>
                            <TableHead className="text-right">Open</TableHead>
                            <TableHead className="text-right" title="Filed after it had already been fixed once">
                              After a fix
                            </TableHead>
                            {showVotes && <TableHead className="text-right">Votes</TableHead>}
                            <TableHead className="text-right">Avg fix time</TableHead>
                            <TableHead className="text-right">Last seen</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {list.map((r, i) => (
                            <TableRow
                              key={r.groupKey}
                              className="cursor-pointer"
                              onClick={() => onSelect(r)}
                              data-cy="recurring-row"
                            >
                              <TableCell className="text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="max-w-[340px] whitespace-normal">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-medium" title={r.title}>{r.title}</span>
                                  {r.linked && (
                                    <span title="Grouped by links your team made" data-cy="recurring-linked">
                                      <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                  {canOpen ? (
                                    <Link
                                      to={openPath(r)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 font-mono hover:text-foreground hover:underline"
                                    >
                                      {r.referenceCode} <ExternalLink className="size-3" />
                                    </Link>
                                  ) : (
                                    <span className="font-mono">{r.referenceCode}</span>
                                  )}
                                  <span>{r.projectName}</span>
                                  <FocusBadge row={r} />
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary" data-cy="recurring-count">{r.count}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{r.open}</TableCell>
                              <TableCell className="text-right">
                                <span className={`tabular-nums ${r.afterFix > 0 ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                                  {r.afterFix}
                                </span>
                              </TableCell>
                              {showVotes && (
                                <TableCell className="text-right tabular-nums">{r.votes ?? "—"}</TableCell>
                              )}
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {fmtMs(r.avgResolutionMs)}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {new Date(r.lastSeenAt).toLocaleDateString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              )
            })}
          </Tabs>
        )}

        <p className="text-xs text-muted-foreground">
          Counts cover what was raised in the selected range. To group reports worded differently, mark them as
          repeats from a ticket&apos;s <span className="font-medium text-foreground">Related tickets</span> section.
        </p>
      </CardContent>
    </Card>
  )
}

// pages/EmailLogPage.tsx — every email the system sent, tried to send or skipped,
// and which mail provider was responsible. Platform admins only (emaillog.read).
//
// Read-only by construction: there is no delete, resend or export here, and no
// endpoint behind one. The log never holds a message body.
import { useEffect, useMemo, useState } from "react"
import { AlertCircle, MailSearch, RefreshCw, Search, Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ClearFiltersButton } from "@/components/shared/ClearFiltersButton"
import { DateRangeFilter } from "@/components/shared/DateRangeFilter"
import { useDebouncedSearch } from "@/hooks/useDebounce"
import { useEmailLogs, useEmailLogSummary } from "@/hooks/useEmailLog"
import {
  DEFAULT_EMAIL_LOG_PERIOD,
  EMAIL_LOG_PERIODS,
  EMAIL_LOG_PERIOD_LABELS,
  browserTimeZone,
  describePeriod,
  type EmailLogPeriod,
  type PeriodSelection,
} from "@/lib/emailLogPeriods"
import {
  EMAIL_KIND_OPTIONS,
  EMAIL_PROVIDER_CODES,
  EMAIL_STATUSES,
  EMAIL_STATUS_META,
  kindLabel,
  providerLabel,
  statusLabel,
} from "@/lib/emailLogLabels"
import { cn } from "@/lib/utils"
import { NO_PROVIDER, type EmailLogEntry, type EmailLogStatus } from "@/types/emailLog.types"

const PAGE_SIZES = [10, 25, 50, 100]
const ALL = "all"
const COLUMNS = 7

// "Wed 25 Nov 2026, 14:03:09" in the admin's own time zone — seconds included,
// because two emails in the same minute are the whole point of a log.
const whenFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" })

function StatusBadge({ status }: { status: EmailLogStatus }) {
  const meta = EMAIL_STATUS_META[status]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={cn("border-transparent", meta?.badge)} tabIndex={0} data-cy={`email-status-${status}`}>
          {statusLabel(status)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{meta?.hint ?? status}</TooltipContent>
    </Tooltip>
  )
}

function ProviderCell({ entry }: { entry: EmailLogEntry }) {
  return (
    <div className="space-y-0.5" data-cy="email-provider">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn(!entry.provider && "text-muted-foreground")}>{providerLabel(entry.provider)}</span>
        {entry.fallback && (
          <Badge variant="outline" className="px-1.5 text-[10px] font-medium" title={entry.note ?? undefined} data-cy="email-fallback">
            Fallback
          </Badge>
        )}
      </div>
      {entry.providerMessageId && (
        <div className="max-w-[11rem] truncate text-[11px] text-muted-foreground" title={`Provider message id: ${entry.providerMessageId}`}>
          {entry.providerMessageId}
        </div>
      )}
    </div>
  )
}

interface TileProps {
  status: EmailLogStatus
  count: number | undefined
  active: boolean
  onToggle: () => void
}

// A tile is also a filter: click to show only that status, click again to clear.
function StatusTile({ status, count, active, onToggle }: TileProps) {
  const meta = EMAIL_STATUS_META[status]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={active}
          onClick={onToggle}
          data-cy={`email-tile-${status}`}
          className={cn(
            "flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:p-4",
            active && "border-primary ring-2 ring-primary/30"
          )}
        >
          <span className="text-xs font-medium text-muted-foreground sm:text-sm">{meta.label}</span>
          {count === undefined ? (
            <Skeleton className="h-8 w-14" />
          ) : (
            <span className={cn("text-2xl font-semibold tabular-nums sm:text-3xl", meta.tile)}>{count.toLocaleString()}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{meta.hint}</TooltipContent>
    </Tooltip>
  )
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }, (_, row) => (
        <TableRow key={row} data-cy="email-skeleton-row">
          {Array.from({ length: COLUMNS }, (_, col) => (
            <TableCell key={col}>
              <Skeleton className={cn("h-4", col === 2 ? "w-48" : "w-24")} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export default function EmailLogPage() {
  const [period, setPeriod] = useState<EmailLogPeriod>(DEFAULT_EMAIL_LOG_PERIOD)
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [status, setStatus] = useState<EmailLogStatus | "">("")
  const [kind, setKind] = useState("")
  const [provider, setProvider] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)

  // Typing waits out the delay; an emptied box applies at once.
  const search = useDebouncedSearch(searchInput.trim())

  const selection: PeriodSelection = useMemo(() => ({ period, customFrom, customTo }), [period, customFrom, customTo])
  const filters = useMemo(
    () => ({
      status: status || undefined,
      kind: kind || undefined,
      provider: provider || undefined,
      search: search || undefined,
    }),
    [status, kind, provider, search]
  )

  const list = useEmailLogs({ selection, filters, page, limit })
  const summary = useEmailLogSummary(selection, filters)

  const entries = list.data?.data ?? []
  const meta = list.data?.meta
  const total = meta?.total ?? 0
  const hasFilter = Boolean(status || kind || provider || searchInput.trim())
  const periodActive = period !== "all_time"

  // Every filter, including the period, starts again from page 1: page 7 of one
  // view is rarely page 7 of another, and an empty page reads as "no results".
  const reset = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    setPage(1)
  }
  const pick = (value: string) => (value === ALL ? "" : value)

  const clearFilters = () => {
    setSearchInput("")
    setStatus("")
    setKind("")
    setProvider("")
    setPage(1)
  }

  // The retention job can shorten the log under a reader on a late page.
  useEffect(() => {
    if (meta && meta.totalPages > 0 && page > meta.totalPages) setPage(meta.totalPages)
  }, [meta, page])

  const timeZone = browserTimeZone()
  const showing = describePeriod(selection, new Date(), timeZone)

  const retry = () => {
    void list.refetch()
    void summary.refetch()
  }

  const firstRow = total === 0 ? 0 : (page - 1) * limit + 1
  const lastRow = Math.min(page * limit, total)
  // First load only: later loads keep the previous rows on screen.
  const loading = list.isLoading
  const failed = list.isError || summary.isError
  const failure = (list.error ?? summary.error) as Error | null

  return (
    <div className="min-w-0 space-y-5" data-cy="email-log-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email log</h1>
        <p className="text-sm text-muted-foreground">
          Every email ServiceDesk4u sent, tried to send, or deliberately skipped, and which mail provider handled it. Only platform admins
          can see this page. Message text is never stored, and entries older than 90 days are removed automatically.
        </p>
      </div>

      {/* Period + filters */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Select value={period} onValueChange={reset((v: string) => setPeriod(v as EmailLogPeriod))}>
            <SelectTrigger className="w-full sm:w-[160px]" aria-label="Period" data-cy="email-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_LOG_PERIODS.map((p) => (
                <SelectItem key={p} value={p}>
                  {EMAIL_LOG_PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                setPage(1)
              }}
              placeholder="Search recipient or subject"
              aria-label="Search recipient or subject"
              className="pl-8"
              data-cy="email-search"
            />
          </div>

          <Select value={status || ALL} onValueChange={reset((v: string) => setStatus(pick(v) as EmailLogStatus | ""))}>
            <SelectTrigger className="w-full sm:w-[140px]" aria-label="Status" data-cy="email-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {EMAIL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={kind || ALL} onValueChange={reset((v: string) => setKind(pick(v)))}>
            <SelectTrigger className="w-full sm:w-[200px]" aria-label="Type" data-cy="email-kind-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {EMAIL_KIND_OPTIONS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={provider || ALL} onValueChange={reset((v: string) => setProvider(pick(v)))}>
            <SelectTrigger className="w-full sm:w-[180px]" aria-label="Provider" data-cy="email-provider-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All providers</SelectItem>
              {EMAIL_PROVIDER_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {providerLabel(code)}
                </SelectItem>
              ))}
              <SelectItem value={NO_PROVIDER}>No provider</SelectItem>
            </SelectContent>
          </Select>

          <ClearFiltersButton active={hasFilter} onClick={clearFilters} />
        </div>

        {period === "custom" && (
          <DateRangeFilter
            from={customFrom}
            to={customTo}
            onFromChange={reset(setCustomFrom)}
            onToChange={reset(setCustomTo)}
          />
        )}

        <p className="text-xs text-muted-foreground" data-cy="email-showing">
          Showing: {showing} · times in {timeZone}
        </p>
      </div>

      {/* Tiles: the totals for this period and these filters, and a status filter besides */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3" data-cy="email-tiles">
        {EMAIL_STATUSES.map((s) => (
          <StatusTile
            key={s}
            status={s}
            count={summary.data?.[s]}
            active={status === s}
            onToggle={() => {
              setStatus(status === s ? "" : s)
              setPage(1)
            }}
          />
        ))}
      </div>

      {failed && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
          data-cy="email-error"
        >
          <span className="flex min-w-0 items-start gap-2 text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words">{failure?.message || "Failed to load the email log"}</span>
          </span>
          <Button variant="outline" size="sm" onClick={retry} data-cy="email-retry">
            <RefreshCw className="mr-1 size-3.5" /> Retry
          </Button>
        </div>
      )}

      {/* The table scrolls sideways inside its own box on a phone; the page never does. */}
      {(!failed || list.data) && (
        <div className="rounded-lg border" data-cy="email-table">
          <Table className="min-w-[1020px]">
            <TableHeader>
              <TableRow>
                {/* Minimum widths keep a column from collapsing to a sliver when the table scrolls sideways */}
                <TableHead className="min-w-[10.5rem]">When</TableHead>
                <TableHead className="min-w-[10rem]">To</TableHead>
                <TableHead className="min-w-[12rem]">Subject</TableHead>
                <TableHead className="min-w-[6.5rem]">Organisation</TableHead>
                <TableHead className="min-w-[7rem]">Type</TableHead>
                <TableHead className="min-w-[8.5rem]">Provider</TableHead>
                <TableHead className="min-w-[9rem]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableSkeleton />}

              {!loading && entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="h-40 whitespace-normal" data-cy="email-empty">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <MailSearch className="size-8 text-muted-foreground" />
                      <p className="text-sm font-medium">
                        {hasFilter ? "No emails match these filters" : periodActive ? "No emails in this period" : "No emails logged yet"}
                      </p>
                      <p className="max-w-md text-xs text-muted-foreground">
                        {periodActive
                          ? "Nothing was sent, attempted or skipped in the period you picked."
                          : "Emails appear here as soon as the system sends, tries to send, or skips one."}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {periodActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPeriod("all_time")
                              setPage(1)
                            }}
                            data-cy="email-show-all-time"
                          >
                            Show all time
                          </Button>
                        )}
                        {hasFilter && (
                          <Button size="sm" variant="ghost" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                entries.map((e) => (
                  <TableRow key={e.id} data-cy="email-row" className="align-top">
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">{whenFormat.format(new Date(e.createdAt))}</TableCell>
                    <TableCell className="break-words whitespace-normal text-sm">{e.to}</TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="line-clamp-2 text-sm" title={e.subject}>
                        {e.subject}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.organizationName ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">{kindLabel(e.kind)}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <ProviderCell entry={e} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <StatusBadge status={e.status} />
                      {e.note && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={e.note} data-cy="email-note">
                          {e.note}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span data-cy="email-range">{total === 0 ? "No entries" : `Showing ${firstRow}–${lastRow} of ${total.toLocaleString()}`}</span>
          <Select
            value={String(limit)}
            onValueChange={(v) => {
              setLimit(Number(v))
              setPage(1)
            }}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-cy="email-prev">
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page}
            {meta?.totalPages ? ` of ${meta.totalPages}` : ""}
          </span>
          <Button variant="outline" size="sm" disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)} data-cy="email-next">
            Next
          </Button>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3 shrink-0" />
        <span>
          Read-only. "Sent" means the mail provider accepted the message; it does not prove the email reached an inbox. The list refreshes
          every 30 seconds.
        </span>
      </p>
    </div>
  )
}

// lib/emailLogPeriods.ts — the email log's period filter, as pure functions.
//
// The BROWSER works out the exact start and end moments of a period in the
// admin's own time zone and sends them to the API as ISO timestamps; the server
// never guesses a time zone. `from` is inclusive and `to` is exclusive: a period
// is the half-open window [from, to), so two periods that meet never overlap.
//
// Pure on purpose: the clock and the time zone are arguments, never read from
// the environment, so every rule here is testable in any zone. No imports, so it
// also runs under plain Node (see emailLogPeriods.test.ts).

export const EMAIL_LOG_PERIODS = [
  "last_hour",
  "last_24_hours",
  "last_7_days",
  "last_30_days",
  "today",
  "yesterday",
  "all_time",
  "custom",
] as const

export type EmailLogPeriod = (typeof EMAIL_LOG_PERIODS)[number]

export const DEFAULT_EMAIL_LOG_PERIOD: EmailLogPeriod = "last_24_hours"

export const EMAIL_LOG_PERIOD_LABELS: Record<EmailLogPeriod, string> = {
  last_hour: "Last hour",
  last_24_hours: "Last 24 hours",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  today: "Today",
  yesterday: "Yesterday",
  all_time: "All time",
  custom: "Pick dates",
}

// What the admin picked. For "custom", the two days are YYYY-MM-DD strings from
// <input type="date"> (empty while unset).
export interface PeriodSelection {
  period: EmailLogPeriod
  customFrom?: string
  customTo?: string
}

// The window to send to the API. A missing end means "no limit on that side".
export interface PeriodRange {
  from?: string
  to?: string
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

// Whole-day offsets from "now" for the sliding periods.
const SLIDING_MS: Partial<Record<EmailLogPeriod, number>> = {
  last_hour: HOUR,
  last_24_hours: DAY,
  last_7_days: 7 * DAY,
  last_30_days: 30 * DAY,
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

// ── Calendar days in a time zone ─────────────────────────────────────────────

interface CalendarDay {
  year: number
  month: number // 1-12
  day: number
}

// A day's position on a time-zone-free calendar: whole days since 1970-01-01.
const dayNumber = ({ year, month, day }: CalendarDay): number => Date.UTC(year, month - 1, day) / DAY

function fromDayNumber(n: number): CalendarDay {
  const d = new Date(n * DAY)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

const formatters = new Map<string, Intl.DateTimeFormat>()

// The calendar day an instant falls on, as a clock in `timeZone` shows it.
function calendarDayAt(instant: number, timeZone: string): CalendarDay {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
    formatters.set(timeZone, formatter)
  }
  const parts = formatter.formatToParts(instant)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: part("year"), month: part("month"), day: part("day") }
}

// The first instant of a calendar day in `timeZone`, as milliseconds since the epoch.
//
// Found by search rather than by adding an offset, because the offset is
// exactly what changes on the awkward days: a spring-forward day is 23 hours
// long, a fall-back day 25, and in a few zones the clocks skip midnight itself,
// so "00:00" does not exist and the day starts at 01:00. The calendar day a
// clock shows never goes backwards as time passes, so the first instant that
// shows this day (or later) is the start of it, whatever the zone does.
function startOfDay(target: CalendarDay, timeZone: string): number {
  const wanted = dayNumber(target)
  const around = Date.UTC(target.year, target.month - 1, target.day)
  // No zone is more than 14 hours from UTC, so 36 hours either side brackets it.
  let lo = Math.floor((around - 36 * HOUR) / 1000)
  let hi = Math.ceil((around + 36 * HOUR) / 1000)
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (dayNumber(calendarDayAt(mid * 1000, timeZone)) >= wanted) hi = mid
    else lo = mid + 1
  }
  return lo * 1000
}

const addDays = (day: CalendarDay, days: number): CalendarDay => fromDayNumber(dayNumber(day) + days)

// ── Custom dates ──────────────────────────────────────────────────────────────

// "2026-11-23" → its calendar day, or null for anything that is not a real date.
function parseDay(value: string | undefined): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
  if (!match) return null
  const day = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  // Date.UTC rolls 2026-02-31 over to March; a real date comes back unchanged.
  const back = fromDayNumber(dayNumber(day))
  return back.year === day.year && back.month === day.month && back.day === day.day ? day : null
}

// The picked custom days, or why they cannot be used.
function customDays(selection: PeriodSelection): { from: CalendarDay | null; to: CalendarDay | null; reversed: boolean } {
  const from = parseDay(selection.customFrom)
  const to = parseDay(selection.customTo)
  const reversed = Boolean(from && to && dayNumber(from) > dayNumber(to))
  return { from, to, reversed }
}

// ── The API window ────────────────────────────────────────────────────────────

const iso = (ms: number): string => new Date(ms).toISOString()

// The exact window for a selection, at the moment `now`, in the admin's time zone.
//
// Sliding periods ("Last 24 hours") are measured back from `now`, so calling this
// again later gives a later window: callers recompute on every fetch to keep them
// sliding. Calendar periods are whole local days: "Today" runs from this local
// midnight to the next, "Yesterday" is the day before. A custom range includes
// its last day (the window ends at the start of the day AFTER it), the same date
// twice is that one day, and a reversed range is ignored — no date filter at all.
export function resolvePeriod(selection: PeriodSelection, now: Date, timeZone: string = browserTimeZone()): PeriodRange {
  const slide = SLIDING_MS[selection.period]
  if (slide !== undefined) return { from: iso(now.getTime() - slide) }

  const today = calendarDayAt(now.getTime(), timeZone)
  switch (selection.period) {
    case "today":
      return { from: iso(startOfDay(today, timeZone)), to: iso(startOfDay(addDays(today, 1), timeZone)) }
    case "yesterday":
      return { from: iso(startOfDay(addDays(today, -1), timeZone)), to: iso(startOfDay(today, timeZone)) }
    case "custom": {
      const { from, to, reversed } = customDays(selection)
      if (reversed) return {}
      return {
        ...(from ? { from: iso(startOfDay(from, timeZone)) } : {}),
        ...(to ? { to: iso(startOfDay(addDays(to, 1), timeZone)) } : {}),
      }
    }
    case "all_time":
    default:
      return {}
  }
}

// ── Saying what is being shown ────────────────────────────────────────────────

function dayText(day: CalendarDay, withWeekday = false): string {
  // The day is a calendar date with no zone of its own, so format it as UTC.
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    ...(withWeekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dayNumber(day) * DAY))
}

// A short phrase for the "Showing: …" line under the filters.
export function describePeriod(selection: PeriodSelection, now: Date, timeZone: string = browserTimeZone()): string {
  switch (selection.period) {
    case "last_hour":
      return "the last hour"
    case "last_24_hours":
      return "the last 24 hours"
    case "last_7_days":
      return "the last 7 days"
    case "last_30_days":
      return "the last 30 days"
    case "today":
      return `today, ${dayText(calendarDayAt(now.getTime(), timeZone), true)}`
    case "yesterday":
      return `yesterday, ${dayText(addDays(calendarDayAt(now.getTime(), timeZone), -1), true)}`
    case "all_time":
      return "all time"
    case "custom": {
      const { from, to, reversed } = customDays(selection)
      if (reversed) return "all time — the end date is before the start date, so the dates are ignored"
      if (from && to) {
        return dayNumber(from) === dayNumber(to) ? dayText(from, true) : `${dayText(from)} to ${dayText(to)}`
      }
      if (from) return `from ${dayText(from)} onwards`
      if (to) return `up to and including ${dayText(to)}`
      return "all time — no dates picked yet"
    }
  }
}

// components/ui/date-picker.tsx — in-DOM calendar picker (YYYY-MM-DD).
//
// Native <input type="date"> opens a browser-level popup that Chromium
// immediately dismisses inside modal Radix Dialogs (FocusScope / pointer-event
// locking). Rendering the calendar inside a Radix Popover keeps focus and
// dismissal inside the same layer stack that dialog.tsx already coordinates.
import { useMemo, useState } from "react"
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  clearable?: boolean
  disabled?: boolean
  className?: string
  "aria-label"?: string
  "data-cy"?: string
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) }
}

function formatDisplay(iso: string): string {
  const parsed = parseIso(iso)
  if (!parsed) return ""
  return new Date(parsed.year, parsed.month, parsed.day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function getTodayIso(): string {
  const now = new Date()
  return toIso(now.getFullYear(), now.getMonth(), now.getDate())
}

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  clearable = false,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  "data-cy": dataCy,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"days" | "months">("days")

  const todayIso = getTodayIso()
  const initial = parseIso(value) ?? parseIso(min && todayIso < min ? min : max && todayIso > max ? max : todayIso)!
  const [viewYear, setViewYear] = useState(initial.year)
  const [viewMonth, setViewMonth] = useState(initial.month)

  const handleOpenChange = (next: boolean) => {
    if (next) {
      const anchor = parseIso(value) ?? parseIso(min && todayIso < min ? min : max && todayIso > max ? max : todayIso)!
      setViewYear(anchor.year)
      setViewMonth(anchor.month)
      setMode("days")
    }
    setOpen(next)
  }

  const isDayDisabled = (iso: string) => (!!min && iso < min) || (!!max && iso > max)

  const isMonthDisabled = (year: number, month: number) => {
    const first = toIso(year, month, 1)
    const last = toIso(year, month, new Date(year, month + 1, 0).getDate())
    return (!!min && last < min) || (!!max && first > max)
  }

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1)
    // Monday = 0 … Sunday = 6
    const offset = (firstOfMonth.getDay() + 6) % 7
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate()

    const list: { iso: string; day: number; inMonth: boolean }[] = []
    for (let i = offset - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, daysInPrev - i)
      list.push({ iso: toIso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: false })
    }
    for (let day = 1; day <= daysInMonth; day++) {
      list.push({ iso: toIso(viewYear, viewMonth, day), day, inMonth: true })
    }
    let nextDay = 1
    while (list.length < 42) {
      const d = new Date(viewYear, viewMonth + 1, nextDay++)
      list.push({ iso: toIso(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: false })
    }
    return list
  }, [viewYear, viewMonth])

  const stepMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const selectDate = (iso: string) => {
    onChange(iso)
    setOpen(false)
  }

  const prevMonthDisabled = (() => {
    if (!min) return false
    const d = new Date(viewYear, viewMonth, 0)
    return toIso(d.getFullYear(), d.getMonth(), d.getDate()) < min
  })()

  const nextMonthDisabled = (() => {
    if (!max) return false
    const d = new Date(viewYear, viewMonth + 1, 1)
    return toIso(d.getFullYear(), d.getMonth(), d.getDate()) > max
  })()

  const display = formatDisplay(value)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          data-cy={dataCy}
          data-slot="input"
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 dark:hover:bg-input/50",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            !display && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{display || placeholder}</span>
          <Calendar className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[17.5rem] p-3">
        <div className="mb-2 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "days" ? "months" : "days"))}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            {mode === "days" ? `${MONTHS_LONG[viewMonth]} ${viewYear}` : viewYear}
            <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", mode === "months" && "rotate-180")} />
          </button>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label={mode === "days" ? "Previous month" : "Previous year"}
              disabled={mode === "days" ? prevMonthDisabled : !!min && `${viewYear - 1}-12-31` < min}
              onClick={() => (mode === "days" ? stepMonth(-1) : setViewYear((y) => y - 1))}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label={mode === "days" ? "Next month" : "Next year"}
              disabled={mode === "days" ? nextMonthDisabled : !!max && `${viewYear + 1}-01-01` > max}
              onClick={() => (mode === "days" ? stepMonth(1) : setViewYear((y) => y + 1))}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {mode === "months" ? (
          <div className="grid grid-cols-3 gap-1 py-1">
            {MONTHS_SHORT.map((label, monthIndex) => {
              const isSelected = viewMonth === monthIndex
              const isDisabled = isMonthDisabled(viewYear, monthIndex)
              return (
                <button
                  key={label}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    setViewMonth(monthIndex)
                    setMode("days")
                  }}
                  className={cn(
                    "h-8 rounded-md text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                    isDisabled && "pointer-events-none opacity-30",
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
              {WEEKDAYS.map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {cells.map((cell) => {
                const isSelected = cell.iso === value
                const isToday = cell.iso === todayIso
                const isDisabled = isDayDisabled(cell.iso)
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => selectDate(cell.iso)}
                    className={cn(
                      "flex h-8 w-full items-center justify-center rounded-md text-xs transition-colors",
                      isSelected
                        ? "bg-primary font-medium text-primary-foreground"
                        : isToday
                          ? "bg-accent font-medium text-accent-foreground ring-1 ring-ring/40"
                          : "hover:bg-accent hover:text-accent-foreground",
                      !cell.inMonth && !isSelected && "text-muted-foreground/60",
                      isDisabled && "pointer-events-none opacity-30",
                    )}
                  >
                    {cell.day}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs">
          {clearable && value ? (
            <button
              type="button"
              onClick={() => selectDate("")}
              className="rounded px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Clear
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={isDayDisabled(todayIso)}
            onClick={() => selectDate(todayIso)}
            className="rounded px-1.5 py-0.5 font-medium text-primary hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

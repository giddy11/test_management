import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bug, FileText, FlaskConical, Folder, Layers, MessageSquareHeart, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { InlineLoader } from "@/components/shared/PageLoader"
import { useDebounce } from "@/hooks/useDebounce"
import { MIN_SEARCH_LENGTH, useGlobalSearch } from "@/hooks/useGlobalSearch"
import { cn } from "@/lib/utils"
import type { SearchResult, SearchResultType } from "@/types/search.types"

// How each record type presents itself in the list: the label on its badge and
// the icon beside it — the same icons the rest of the app uses for these records.
const TYPE_META: Record<SearchResultType, { label: string; icon: typeof Folder }> = {
  project: { label: "Project", icon: Folder },
  suite: { label: "Test Suite", icon: Layers },
  case: { label: "Test Case", icon: FileText },
  run: { label: "Test Run", icon: FlaskConical },
  bug: { label: "Bug", icon: Bug },
  ticket: { label: "Ticket", icon: MessageSquareHeart },
}

// Where clicking a result takes you. Every type has a page of its own except a
// ticket, which is read in the triage list — deep-linked by its TKT code, the
// same way the SLA dashboard drills in.
function linkFor(r: SearchResult): string {
  switch (r.type) {
    case "project":
      return `/projects/${r.projectId}`
    case "suite":
      return `/projects/${r.projectId}/suites/${r.id}`
    case "case":
      return `/projects/${r.projectId}/suites/${r.suiteId}/cases/${r.id}`
    case "run":
      return `/projects/${r.projectId}/runs/${r.id}`
    case "bug":
      return `/projects/${r.projectId}/bugs/${r.id}`
    case "ticket":
      return r.reference
        ? `/all-feedback?q=${encodeURIComponent(r.reference)}`
        : `/projects/${r.projectId}?tab=feedback`
  }
}

// The line under the title: enough to tell two similarly-named records apart
// without opening either — which project it is in, and the suite or status.
function subtitleFor(r: SearchResult): string {
  if (r.type === "project") return "Project"
  return [r.projectName, r.context].filter(Boolean).join(" · ")
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const [term, setTerm] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const debounced = useDebounce(term, 300)
  const { data: results = [], isFetching } = useGlobalSearch(debounced, open)

  const trimmed = term.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_SEARCH_LENGTH
  // The results on screen belong to `debounced`, so "no results" is only true
  // once the request for what is actually typed has come back.
  const settled = debounced.trim() === trimmed && !isFetching
  const showPanel = open && trimmed.length > 0

  const items = useMemo(() => results.map((r) => ({ r, to: linkFor(r) })), [results])

  // A new term is a new list — start the keyboard selection at the top again.
  useEffect(() => setActive(0), [debounced])

  // Clicking anywhere else closes the panel; the input keeps whatever was typed
  // so returning to it resumes the same search.
  useEffect(() => {
    if (!showPanel) return
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [showPanel])

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  const clear = () => {
    setTerm("")
    setOpen(false)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // First Escape dismisses the results, a second clears the box — so a
      // glance at a result never costs you what you typed.
      if (showPanel) setOpen(false)
      else clear()
      return
    }
    if (!showPanel || items.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (i - 1 + items.length) % items.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      go(items[active].to)
    }
  }

  return (
    <div ref={containerRef} className="relative w-40 sm:w-56 md:w-72 lg:w-96">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search TestMate…"
        aria-label="Search projects, suites, cases, runs and tickets"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        autoComplete="off"
        data-cy="global-search-input"
        className="h-9 pl-8 pr-8"
      />
      {term.length > 0 && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          data-cy="global-search-clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}

      {showPanel && (
        <div
          id="global-search-results"
          role="listbox"
          data-cy="global-search-results"
          className="absolute right-0 top-full z-50 mt-1.5 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          {tooShort && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Keep typing — at least {MIN_SEARCH_LENGTH} characters.
            </p>
          )}

          {!tooShort && isFetching && items.length === 0 && (
            <InlineLoader className="py-6" label="Searching" />
          )}

          {!tooShort && settled && items.length === 0 && (
            <p
              className="px-3 py-6 text-center text-sm text-muted-foreground"
              data-cy="global-search-empty"
            >
              No results found for &ldquo;{trimmed}&rdquo;.
            </p>
          )}

          {items.length > 0 && (
            <div className="max-h-96 overflow-y-auto">
              {items.map(({ r, to }, i) => {
                const { label, icon: Icon } = TYPE_META[r.type]
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    data-cy="global-search-result"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(to)}
                    className={cn(
                      "flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent",
                      i === active && "bg-accent"
                    )}
                  >
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        {r.reference && (
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {r.reference}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{subtitleFor(r)}</p>
                    </div>
                    <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
                      {label}
                    </Badge>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

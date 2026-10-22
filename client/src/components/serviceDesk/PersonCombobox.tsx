// components/serviceDesk/PersonCombobox.tsx — pick one person from a long
// list by typing part of their name or email. Shows the email under each name,
// since two people can share a name and nobody knows everyone's job title.
// Keyboard: type to filter, ↑/↓ to move, Enter to choose, Esc to close.
import { useMemo, useRef, useState } from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PickablePerson {
  id: string
  name: string
  email: string
}

const NONE = "__none__"

export function PersonCombobox({
  people,
  value,
  onChange,
  noneLabel,
  placeholder = "Choose someone",
  disabled,
  "aria-label": ariaLabel,
}: {
  people: PickablePerson[]
  value: string | null
  onChange: (id: string | null) => void
  // Shown as the first choice (meaning "nobody") when given.
  noneLabel?: string
  placeholder?: string
  disabled?: boolean
  "aria-label"?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = value ? people.find((p) => p.id === value) : null
  const options = useMemo(() => {
    const t = query.trim().toLowerCase()
    const matches = t ? people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(t)) : people
    const none = noneLabel && (!t || noneLabel.toLowerCase().includes(t)) ? [{ id: NONE, name: noneLabel, email: "" }] : []
    return [...none, ...matches]
  }, [people, query, noneLabel])

  const choose = (id: string) => {
    onChange(id === NONE ? null : id)
    setOpen(false)
  }

  const move = (to: number) => {
    const next = Math.max(0, Math.min(options.length - 1, to))
    setActive(next)
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" })
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setQuery("")
          setActive(0)
        }
      }}
    >
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
        >
          <span className={cn("truncate", !selected && !noneLabel && "text-muted-foreground")}>
            {selected ? selected.name : noneLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-(--radix-popover-trigger-width) min-w-72 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          onOpenAutoFocus={(e) => {
            // Focus the search box, not the first option.
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).querySelector("input")?.focus()
          }}
        >
          <div className="flex items-center gap-2 border-b px-2 pb-1">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  move(active + 1)
                } else if (e.key === "ArrowUp") {
                  e.preventDefault()
                  move(active - 1)
                } else if (e.key === "Enter") {
                  e.preventDefault()
                  if (options[active]) choose(options[active].id)
                }
              }}
              aria-label="Search people"
              data-cy="person-search"
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto pt-1">
            {options.length === 0 && <p className="px-2 py-3 text-center text-sm text-muted-foreground">Nobody matches “{query.trim()}”.</p>}
            {options.map((p, i) => {
              const isSelected = p.id === NONE ? !value : p.id === value
              return (
                <div
                  key={p.id}
                  role="option"
                  aria-selected={isSelected}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p.id)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm",
                    i === active && "bg-accent text-accent-foreground"
                  )}
                >
                  <span className="min-w-0">
                    <span className={cn("block truncate", p.id === NONE && "text-muted-foreground")}>{p.name}</span>
                    {p.email && <span className="block truncate text-xs text-muted-foreground">{p.email}</span>}
                  </span>
                  {isSelected && <Check className="size-4 shrink-0" />}
                </div>
              )
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

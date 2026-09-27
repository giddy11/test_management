import { useRef, useState, type KeyboardEvent, type RefObject } from "react"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export interface MentionCandidate {
  id: string
  name: string
}

interface MentionMatch {
  query: string
  start: number
}

// Looks for an unclosed "@partial name" right before the cursor — start of
// string or whitespace, then "@", then up to 30 chars with no line break.
// Names can contain spaces, so the query isn't cut at the first space.
function findMentionMatch(value: string, cursor: number): MentionMatch | null {
  const upToCursor = value.slice(0, cursor)
  const m = /(^|\s)@([^\n@]{0,30})$/.exec(upToCursor)
  if (!m) return null
  return { query: m[2], start: m.index + m[1].length }
}

interface Props {
  value: string
  onValueChange: (value: string) => void
  onMention: (user: MentionCandidate) => void
  users: MentionCandidate[]
  placeholder?: string
  rows?: number
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  onInput?: () => void
}

// A plain Textarea with an "@" autocomplete — selecting a suggestion inserts
// "@Full Name " into the text and reports the picked user separately via
// onMention, so the caller can track who to notify without re-parsing the text.
export function MentionTextarea({
  value,
  onValueChange,
  onMention,
  users,
  placeholder,
  rows = 3,
  textareaRef,
  onInput,
}: Props) {
  const localRef = useRef<HTMLTextAreaElement>(null)
  const ref = textareaRef ?? localRef
  const [match, setMatch] = useState<MentionMatch | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const suggestions = match
    ? users.filter((u) => u.name.toLowerCase().includes(match.query.trim().toLowerCase())).slice(0, 6)
    : []

  const selectUser = (user: MentionCandidate) => {
    const el = ref.current
    if (!match || !el) return
    const cursor = el.selectionStart ?? value.length
    const before = value.slice(0, match.start)
    const after = value.slice(cursor)
    const inserted = `@${user.name} `
    onValueChange(before + inserted + after)
    onMention(user)
    setMatch(null)
    setActiveIndex(0)
    requestAnimationFrame(() => {
      el.focus()
      const pos = before.length + inserted.length
      el.setSelectionRange(pos, pos)
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target
    onValueChange(el.value)
    onInput?.()
    setMatch(findMentionMatch(el.value, el.selectionStart ?? el.value.length))
    setActiveIndex(0)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!match || suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      selectUser(suggestions[activeIndex])
    } else if (e.key === "Escape") {
      e.preventDefault()
      setMatch(null)
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Let a suggestion's onMouseDown fire (it preventDefaults the blur's
          // default, but this still runs) before the dropdown disappears.
          setTimeout(() => setMatch(null), 150)
        }}
      />
      {match && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-64 space-y-0.5 rounded-md border bg-popover p-1 shadow-md">
          {suggestions.map((u, i) => (
            <button
              key={u.id}
              type="button"
              className={cn(
                "block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                i === activeIndex && "bg-accent"
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                selectUser(u)
              }}
            >
              {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

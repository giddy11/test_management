import { useState, type ReactNode } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

// Replies past this count start collapsed — a couple of replies read fine
// inline, but a long sub-thread buries the rest of the conversation below it.
const COLLAPSE_THRESHOLD = 2

export function CollapsibleReplies<T>({
  replies,
  renderReply,
}: {
  replies: T[]
  renderReply: (reply: T) => ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  if (replies.length === 0) return null

  if (replies.length <= COLLAPSE_THRESHOLD || expanded) {
    return (
      <div className="ml-6 space-y-3 border-l-2 pl-4">
        {replies.map((r) => renderReply(r))}
        {replies.length > COLLAPSE_THRESHOLD && (
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(false)}
          >
            <ChevronUp className="size-3.5" /> Hide replies
          </button>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="ml-6 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => setExpanded(true)}
    >
      <ChevronDown className="size-3.5" /> Show {replies.length} replies
    </button>
  )
}

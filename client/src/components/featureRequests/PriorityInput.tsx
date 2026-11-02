import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useUpdateFeatureRequestStatus } from "@/hooks/useFeatureRequests"
import { ApiError } from "@/transport/http"

// Explicit work order — type 1 to tackle a request first, 2 for next, and so
// on. Reuses the same PATCH the status dialog uses (priority is just another
// triage field), so there's no dedicated pin-style endpoint for it.
//
// At rest this is a labeled, dashed-border button — "Set priority" or "#N" —
// not a bare number box, so it reads as something to click rather than
// inert text (same "dashed border = add/edit something here" convention
// used elsewhere in the app). Clicking it reveals the actual number field.
export function PriorityInput({
  requestId,
  priority,
  canManage,
}: {
  requestId: string
  priority: number | null
  canManage: boolean
}) {
  const update = useUpdateFeatureRequestStatus()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(priority != null ? String(priority) : "")
  const inputRef = useRef<HTMLInputElement>(null)

  // A background refetch (e.g. after someone else's edit) must not clobber
  // what's mid-edit here — only resync once this field isn't focused/pending.
  useEffect(() => {
    if (!editing && !update.isPending) setValue(priority != null ? String(priority) : "")
  }, [priority, editing, update.isPending])

  if (!canManage) {
    return priority != null ? (
      <span className="font-medium tabular-nums" data-cy="priority-value">{priority}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    )
  }

  const commit = () => {
    const trimmed = value.trim()
    const next = trimmed === "" ? null : Number(trimmed)

    if (next !== null && (!Number.isInteger(next) || next < 1)) {
      toast.error("Priority must be a whole number, 1 or higher")
      setValue(priority != null ? String(priority) : "")
      setEditing(false)
      return
    }
    setEditing(false)
    if (next === priority) return

    update.mutate(
      { id: requestId, payload: { priority: next } },
      {
        onError: (e) => {
          toast.error(e instanceof ApiError ? e.message : "Couldn't update priority")
          setValue(priority != null ? String(priority) : "")
        },
      }
    )
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        autoFocus
        placeholder="e.g. 1"
        aria-label="Priority — lower numbers are built first"
        className="h-8 w-20 text-center"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            setValue(priority != null ? String(priority) : "")
            setEditing(false)
          }
        }}
        data-cy="priority-input"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Set a build order — lower numbers come first in the list"
      data-cy="priority-trigger"
      className={cn(
        "inline-flex h-8 min-w-20 items-center justify-center rounded-md border border-dashed px-2 text-xs font-medium whitespace-nowrap transition-colors hover:border-primary hover:text-primary",
        priority != null
          ? "border-primary/50 text-primary tabular-nums"
          : "border-muted-foreground/30 text-muted-foreground"
      )}
    >
      {priority != null ? `#${priority}` : "Set priority"}
    </button>
  )
}

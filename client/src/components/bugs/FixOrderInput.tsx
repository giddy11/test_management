import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useManageBug } from "@/hooks/useBugs"
import { ApiError } from "@/transport/http"

// Explicit fix order — type 1 to tackle a bug first, 2 for next, and so on.
// Reuses the same PATCH the Manage dialog uses (fixOrder is just another
// triage field), so there's no dedicated endpoint for it. Named "fix order",
// not "priority" — bugs already have a Low/Medium/High/Urgent priority field,
// a different concept (urgency, not sequence).
//
// At rest this is a labeled, dashed-border button — "Set order" or "#N" — not
// a bare number box, so it reads as something to click rather than inert text
// (same "dashed border = add/edit something here" convention used elsewhere
// in the app). Clicking it reveals the actual number field.
export function FixOrderInput({
  bugId,
  fixOrder,
  canManage,
}: {
  bugId: string
  fixOrder: number | null
  canManage: boolean
}) {
  const manage = useManageBug()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(fixOrder != null ? String(fixOrder) : "")
  const inputRef = useRef<HTMLInputElement>(null)

  // A background refetch (e.g. after someone else's edit) must not clobber
  // what's mid-edit here — only resync once this field isn't focused/pending.
  useEffect(() => {
    if (!editing && !manage.isPending) setValue(fixOrder != null ? String(fixOrder) : "")
  }, [fixOrder, editing, manage.isPending])

  if (!canManage) {
    return fixOrder != null ? (
      <span className="font-medium tabular-nums" data-cy="fix-order-value">{fixOrder}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    )
  }

  const commit = () => {
    const trimmed = value.trim()
    const next = trimmed === "" ? null : Number(trimmed)

    if (next !== null && (!Number.isInteger(next) || next < 1)) {
      toast.error("Fix order must be a whole number, 1 or higher")
      setValue(fixOrder != null ? String(fixOrder) : "")
      setEditing(false)
      return
    }
    setEditing(false)
    if (next === fixOrder) return

    manage.mutate(
      { id: bugId, payload: { fixOrder: next } },
      {
        onError: (e) => {
          toast.error(e instanceof ApiError ? e.message : "Couldn't update fix order")
          setValue(fixOrder != null ? String(fixOrder) : "")
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
        aria-label="Fix order — lower numbers are fixed first"
        className="h-8 w-20 text-center"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            setValue(fixOrder != null ? String(fixOrder) : "")
            setEditing(false)
          }
        }}
        data-cy="fix-order-input"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Set a fix order — lower numbers come first in the list"
      data-cy="fix-order-trigger"
      className={cn(
        "inline-flex h-8 min-w-20 items-center justify-center rounded-md border border-dashed px-2 text-xs font-medium whitespace-nowrap transition-colors hover:border-primary hover:text-primary",
        fixOrder != null
          ? "border-primary/50 text-primary tabular-nums"
          : "border-muted-foreground/30 text-muted-foreground"
      )}
    >
      {fixOrder != null ? `#${fixOrder}` : "Set order"}
    </button>
  )
}

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { useUpdateFeatureRequestStatus } from "@/hooks/useFeatureRequests"
import { ApiError } from "@/transport/http"

// Explicit work order — type 1 to tackle a request first, 2 for next, and so
// on. Reuses the same PATCH the status dialog uses (priority is just another
// triage field), so there's no dedicated pin-style endpoint for it.
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
  const [value, setValue] = useState(priority != null ? String(priority) : "")

  // A background refetch (e.g. after someone else's edit) must not clobber
  // what's mid-edit here — only resync once this field isn't focused/pending.
  useEffect(() => {
    if (!update.isPending) setValue(priority != null ? String(priority) : "")
  }, [priority, update.isPending])

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
      return
    }
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

  return (
    <Input
      type="number"
      min={1}
      step={1}
      inputMode="numeric"
      placeholder="—"
      aria-label="Priority"
      className="h-8 w-16 text-center"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
      data-cy="priority-input"
    />
  )
}

import { Pin } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useToggleFeatureRequestPin } from "@/hooks/useFeatureRequests"
import { ApiError } from "@/transport/http"

// Pinning is a team decision — only a project's team lead or an admin can
// toggle it (same bar as updating status). Anyone else still sees the pinned
// mark, just not as a button, so it's clear why a request sits at the top.
export function PinButton({
  requestId,
  pinnedAt,
  canManage,
}: {
  requestId: string
  pinnedAt: string | null
  canManage: boolean
}) {
  const toggle = useToggleFeatureRequestPin()
  const pinned = Boolean(pinnedAt)

  if (!canManage) {
    if (!pinned) return null
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Pin className="size-4 text-primary" aria-label="Pinned to the top" />
        </TooltipTrigger>
        <TooltipContent>Pinned to the top</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-cy="pin-button"
          aria-label={pinned ? "Unpin this request" : "Pin this request to the top"}
          className={cn(pinned && "text-primary")}
          disabled={toggle.isPending}
          onClick={(e) => {
            e.stopPropagation()
            toggle.mutate(requestId, {
              onError: (err) =>
                toast.error(err instanceof ApiError ? err.message : "Couldn't update pin"),
            })
          }}
        >
          <Pin className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{pinned ? "Unpin" : "Pin to the top (up to 10 per project)"}</TooltipContent>
    </Tooltip>
  )
}

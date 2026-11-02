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
          {/* Same tinted-chip treatment the button below uses when pinned, so a
              viewer who can't click it still gets an unmistakable, matching cue. */}
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Pin className="size-4 fill-current" aria-label="Pinned to the top" />
          </span>
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
          variant="outline"
          size="icon-sm"
          data-cy="pin-button"
          aria-label={pinned ? "Unpin this request" : "Pin this request to the top"}
          // Mirrors VoteButton's active state (border-primary bg-primary/10
          // text-primary) so "pinned" reads the same way elsewhere in the app —
          // plus a filled icon, since an outline-only pin looked the same
          // whether it was pinned or not.
          className={cn(pinned ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
          disabled={toggle.isPending}
          onClick={(e) => {
            e.stopPropagation()
            toggle.mutate(requestId, {
              onError: (err) =>
                toast.error(err instanceof ApiError ? err.message : "Couldn't update pin"),
            })
          }}
        >
          <Pin className={cn("size-4", pinned && "fill-current")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{pinned ? "Unpin" : "Pin to the top (up to 10 per project)"}</TooltipContent>
    </Tooltip>
  )
}

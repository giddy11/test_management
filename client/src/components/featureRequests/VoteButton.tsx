import { ChevronUp } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useToggleFeatureRequestVote } from "@/hooks/useFeatureRequestVote"
import { ApiError } from "@/transport/http"

export function VoteButton({
  requestId,
  upvoteCount,
  hasVoted,
}: {
  requestId: string
  upvoteCount: number
  hasVoted: boolean
}) {
  const toggle = useToggleFeatureRequestVote()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "flex h-auto flex-col items-center gap-0.5 px-3 py-1.5",
        hasVoted && "border-primary bg-primary/10 text-primary"
      )}
      disabled={toggle.isPending}
      onClick={(e) => {
        e.stopPropagation()
        toggle.mutate(requestId, {
          onError: (err) => toast.error(err instanceof ApiError ? err.message : "Vote failed"),
        })
      }}
    >
      <ChevronUp className="size-4" />
      <span className="text-xs font-semibold">{upvoteCount}</span>
    </Button>
  )
}

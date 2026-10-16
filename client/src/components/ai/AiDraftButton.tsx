// components/ai/AiDraftButton.tsx — the one button every AI suggestion uses,
// so they all say the same things the same way:
//   - nothing for people without ai.use, and nothing until the status loads;
//   - when AI isn't set up: a link to Settings → AI for those who can set it
//     up, nothing for everyone else;
//   - the price on the button when it runs on the organisation's metered key,
//     and disabled (with the reason) when the balance can't cover it.
import { Link } from "react-router-dom"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { useAiStatus } from "@/hooks/useAi"
import { credits, type AiFeature } from "@/types/ai.types"

interface AiDraftButtonProps {
  feature: AiFeature
  label: string
  loading?: boolean
  disabled?: boolean
  // Shown beside the button while it's disabled for a form reason (e.g. no title yet).
  disabledReason?: string
  onClick: () => void
}

export function AiDraftButton({ feature, label, loading, disabled, disabledReason, onClick }: AiDraftButtonProps) {
  const { can } = useAuth()
  const canUse = can("ai.use")
  const canSetUp = can("ai.ownkey") || can("ai.managekeys")
  const { data: status } = useAiStatus(feature, canUse)

  if (!canUse || !status) return null

  if (!status.available) {
    return canSetUp ? (
      <Link to="/settings?tab=ai" className="text-xs text-muted-foreground underline-offset-4 hover:underline" data-cy={`ai-setup-${feature}`}>
        Set up AI to get suggestions
      </Link>
    ) : null
  }

  const price = status.source === "organization" ? (status.credits?.price ?? 0) : 0
  const short = price > 0 && (status.credits?.balance ?? 0) < price

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {short ? (
        <span className="text-xs text-muted-foreground">
          Not enough AI credits ({credits(status.credits?.balance ?? 0)} left).
          {can("ai.ownkey") && (
            <>
              {" "}
              <Link to="/settings?tab=ai" className="underline underline-offset-4">Use your own key</Link>
            </>
          )}
        </span>
      ) : (
        disabled && disabledReason && !loading && <span className="text-xs text-muted-foreground">{disabledReason}</span>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 px-2.5 text-xs"
        onClick={onClick}
        disabled={disabled || loading || short}
        data-cy={`ai-draft-${feature}`}
      >
        <Sparkles className="size-3.5" />
        {loading ? "Writing…" : label}
        {price > 0 && !loading && <span className="text-muted-foreground">· {credits(price)}</span>}
      </Button>
    </span>
  )
}


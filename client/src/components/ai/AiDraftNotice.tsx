// components/ai/AiDraftNotice.tsx — shown under a field the AI just filled:
// it's a suggestion to read and edit, which model wrote it, what the AI had to
// assume, and a way to put back what was there before.
import { Sparkles, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { credits, type AiDraftMeta } from "@/types/ai.types"

interface AiDraftNoticeProps {
  draft: AiDraftMeta
  caveats?: string[]
  // e.g. "before you report the bug"
  reviewHint: string
  onUndo?: () => void
  onDismiss: () => void
}

export function AiDraftNotice({ draft, caveats = [], reviewHint, onUndo, onDismiss }: AiDraftNoticeProps) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs" role="status" data-cy="ai-draft-notice">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p>
            <span className="font-medium">AI suggestion</span> — read and edit it {reviewHint}. Written by{" "}
            {draft.model}
            {draft.creditsCharged > 0 ? ` · ${credits(draft.creditsCharged)} used` : ""}.
          </p>
          {caveats.length > 0 && (
            <div>
              <p className="text-muted-foreground">Check these — the AI didn't know them:</p>
              <ul className="ml-4 list-disc text-muted-foreground">
                {caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {onUndo && (
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onUndo} data-cy="ai-draft-undo">
              <Undo2 className="size-3.5" /> Undo
            </Button>
          )}
          <Button type="button" size="icon" variant="ghost" className="size-6" onClick={onDismiss} aria-label="Dismiss">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

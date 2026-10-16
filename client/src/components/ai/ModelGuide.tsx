// components/ai/ModelGuide.tsx — plain-language help for choosing a model.
import { ExternalLink } from "lucide-react"
import { AI_PROVIDERS } from "@/types/ai.types"
import { TIER_LABELS } from "./modelLabels"

export function ModelGuide() {
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2 text-sm" data-cy="ai-model-guide">
      <summary className="cursor-pointer font-medium">Which model should I choose?</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{TIER_LABELS.capable}</span> models write the best
          drafts and follow instructions most closely. They cost the most per request.
        </p>
        <p>
          <span className="font-medium text-foreground">{TIER_LABELS.balanced}</span> models are good for
          everyday drafting at a lower price.
        </p>
        <p>
          <span className="font-medium text-foreground">{TIER_LABELS.fast}</span> models answer quickly and
          cheaply, but may miss details. They suit the chat model, not long drafts.
        </p>
        <p>The labels are a guide, read from each model's name. Check prices with the provider:</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {AI_PROVIDERS.map((p) => (
            <li key={p.id}>
              <a
                href={p.pricingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                {p.label} pricing <ExternalLink className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

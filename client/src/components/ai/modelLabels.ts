// components/ai/modelLabels.ts — how a model's tier reads in pickers.
// The tier is read from the model's NAME on the server (advice only).
import type { AiModelInfo, AiModelTier } from "@/types/ai.types"

export const TIER_LABELS: Record<AiModelTier, string> = {
  capable: "Most capable",
  balanced: "Balanced",
  fast: "Fast & cheap",
}

export function modelOptionLabel(m: AiModelInfo): string {
  return m.tier ? `${m.label} — ${TIER_LABELS[m.tier]}` : m.label
}

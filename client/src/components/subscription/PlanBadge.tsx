// components/subscription/PlanBadge.tsx — an organisation's plan as a small
// coloured badge. Status wording lives in lib/planStatus.ts.
import { cn } from "@/lib/utils"
import type { PlanKey } from "@/types/subscription.types"

const PLAN_STYLES: Record<PlanKey, string> = {
  free: "border-border bg-muted text-muted-foreground",
  standard: "border-brand/40 bg-brand-soft text-brand",
  enterprise: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
}

export function PlanBadge({ planKey, name, className }: { planKey: PlanKey; name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        PLAN_STYLES[planKey],
        className,
      )}
    >
      {name}
    </span>
  )
}

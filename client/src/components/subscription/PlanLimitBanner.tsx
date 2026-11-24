// components/subscription/PlanLimitBanner.tsx — a strip across the top of the
// app for the people who run the workspace, when the organisation is using
// more than its plan includes (after a downgrade, or a paid period ending).
// Nothing is deleted; adding more is blocked until it upgrades or removes some.
import { Link } from "react-router-dom"
import { TriangleAlert } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useMyPlan } from "@/hooks/useSubscription"
import { LIMIT_USAGE_LABELS, limitsReached } from "@/lib/planStatus"

export function PlanLimitBanner() {
  const { can } = useAuth()
  // The organisation's administrators can act on it; the platform owner isn't
  // held to a customer plan.
  const isAdmin = (can("user.create") || can("role.manage")) && !can("platform.read")
  const { data: plan } = useMyPlan()
  if (!isAdmin || !plan) return null

  const over = limitsReached(plan).filter((l) => l.state === "over")
  if (!over.length) return null

  const list = over.map((l) => `${l.used.toLocaleString()} of ${l.max.toLocaleString()} ${LIMIT_USAGE_LABELS[l.key]}`)

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
      data-cy="plan-limit-banner"
    >
      <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />
      <span className="min-w-0 flex-1">
        Your organisation is over its {plan.planName} plan: {list.join(", ")}. Nothing is deleted, but you can&apos;t add
        more until you upgrade or remove some.
      </span>
      <Link to="/settings?tab=plan" className="shrink-0 font-medium text-brand hover:underline">
        See your plan
      </Link>
    </div>
  )
}

// components/subscription/PlanExpiryIndicator.tsx — a small pill in the app
// header saying when the organisation's trial or paid plan ends, so nobody is
// surprised by the lock: "Standard trial · 9 days left", "Standard · until
// 23 Dec 2026". It turns amber in the last week and red on the last day.
//
// Hidden when there's nothing to count down: Free, a plan with no end date,
// or an organisation already locked (the lock screen says it). The platform
// owner isn't on a customer plan. Admins can click through to their plan.
import { Link } from "react-router-dom"
import { CalendarClock } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useMyPlan } from "@/hooks/useSubscription"
import { formatDate } from "@/lib/planStatus"
import { cn } from "@/lib/utils"

const DAY = 86_400_000

export function PlanExpiryIndicator() {
  const { can } = useAuth()
  const { data: plan } = useMyPlan()
  if (!plan || plan.blocked || can("platform.read")) return null

  const endsAt = plan.status === "trial" ? plan.trialEndsAt : plan.status === "active" ? plan.paidUntil : null
  if (!endsAt) return null

  const msLeft = new Date(endsAt).getTime() - Date.now()
  const daysLeft = Math.max(0, Math.ceil(msLeft / DAY))
  const isTrial = plan.status === "trial"
  const label = isTrial ? `${plan.planName} trial` : plan.planName
  // Far off: the date. Within two weeks: the count, which is what matters then.
  const when =
    daysLeft === 0 ? "ends today" : daysLeft <= 14 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : `until ${formatDate(endsAt)}`
  const tone = daysLeft <= 1 ? "urgent" : daysLeft <= 7 ? "soon" : "calm"
  const title = `${label} ${isTrial ? "ends" : "is paid until"} ${formatDate(endsAt)}`

  const className = cn(
    "inline-flex h-7 max-w-[13rem] items-center gap-1.5 truncate rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
    tone === "calm" && "border-border bg-muted/50 text-muted-foreground",
    tone === "soon" && "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    tone === "urgent" && "border-destructive/40 bg-destructive/10 text-destructive",
  )
  const content = (
    <>
      <CalendarClock className="size-3.5 shrink-0" aria-hidden />
      {/* On a phone the plan name goes, the countdown stays. */}
      <span className="hidden truncate sm:inline">{label} ·</span>
      <span className="truncate">{when}</span>
    </>
  )

  const isAdmin = can("user.create") || can("role.manage")
  return isAdmin ? (
    <Link to="/settings?tab=plan" className={cn(className, "hover:brightness-110")} title={title} data-cy="plan-expiry">
      {content}
    </Link>
  ) : (
    <span className={className} title={title} data-cy="plan-expiry">
      {content}
    </span>
  )
}

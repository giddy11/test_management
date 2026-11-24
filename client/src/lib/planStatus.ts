// lib/planStatus.ts — wording for an organisation's plan status.
import type { CountedLimit, EffectivePlan, MyPlan, PlanKey } from "@/types/subscription.types"

export const PLAN_NAMES: Record<PlanKey, string> = { free: "Free", standard: "Standard", enterprise: "Enterprise" }

export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""
}

type StatusFields = Pick<EffectivePlan, "planKey" | "status" | "assignedPlanKey" | "paidUntil" | "trialEndsAt">

/** Whole days until a date, for "5 days left". */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

function leftText(iso: string | null): string {
  const d = daysLeft(iso)
  return d !== null && d >= 0 && d <= 14 ? ` · ${d === 0 ? "ends today" : `${d} day${d === 1 ? "" : "s"} left`}` : ""
}

/** "Paid until 23 Dec 2026", "Trial ends 7 Dec 2026", "Expired 1 Nov 2026 (was Standard)"… */
export function planStatusText(plan: StatusFields): string {
  switch (plan.status) {
    case "active":
      if (plan.planKey === "free") return "Free plan"
      return plan.paidUntil ? `Paid until ${formatDate(plan.paidUntil)}${leftText(plan.paidUntil)}` : "No end date"
    case "trial":
      return `Trial ends ${formatDate(plan.trialEndsAt)}${leftText(plan.trialEndsAt)}`
    case "expired": {
      const ended = plan.trialEndsAt && !plan.paidUntil ? plan.trialEndsAt : plan.paidUntil
      return `Expired ${formatDate(ended)} (was ${PLAN_NAMES[plan.assignedPlanKey]})`
    }
    default:
      return "No subscription"
  }
}

/** A <input type="date"> value (YYYY-MM-DD) for a date, in local time. */
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The ISO time for a date input: the start of that day, or its last second. */
export function fromDateInput(value: string, endOfDay = false): string {
  return new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString()
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return d
}

export const LIMIT_USAGE_LABELS: Record<CountedLimit, string> = {
  full_seats: "full seats",
  projects: "projects",
  test_cases: "test cases",
  client_companies: "client companies",
  storage_gb: "GB of storage",
  ai_credits_monthly: "AI credits given out this month",
}

export interface LimitState {
  key: CountedLimit
  used: number
  max: number
  /** "full": at the limit, nothing more can be added. "over": past it (after a downgrade, say). */
  state: "full" | "over"
}

/** The counted limits the organisation has reached or passed. Unlimited ones never appear. */
export function limitsReached(plan: MyPlan): LimitState[] {
  return (Object.keys(LIMIT_USAGE_LABELS) as CountedLimit[]).flatMap((key) => {
    const max = plan.limits[key]
    const used = plan.usage?.[key] ?? 0
    if (max === null || used < max) return []
    // Storage and AI credits fill up gradually, so only "over" is worth flagging for them.
    if (used === max && (key === "storage_gb" || key === "ai_credits_monthly")) return []
    return [{ key, used, max, state: used > max ? "over" : "full" } as LimitState]
  })
}

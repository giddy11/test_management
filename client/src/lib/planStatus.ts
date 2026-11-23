// lib/planStatus.ts — wording for an organisation's plan status.
import type { EffectivePlan, PlanKey } from "@/types/subscription.types"

export const PLAN_NAMES: Record<PlanKey, string> = { free: "Free", standard: "Standard", enterprise: "Enterprise" }

export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""
}

type StatusFields = Pick<EffectivePlan, "status" | "assignedPlanKey" | "paidUntil" | "trialEndsAt">

/** "Paid until 23 Dec 2026", "Trial ends 7 Dec 2026", "Expired 1 Nov 2026 (was Standard)"… */
export function planStatusText(plan: StatusFields): string {
  switch (plan.status) {
    case "active":
      return plan.paidUntil ? `Paid until ${formatDate(plan.paidUntil)}` : "No end date"
    case "trial":
      return `Trial ends ${formatDate(plan.trialEndsAt)}`
    case "expired": {
      const ended = plan.trialEndsAt && !plan.paidUntil ? plan.trialEndsAt : plan.paidUntil
      return `Expired ${formatDate(ended)} (was ${PLAN_NAMES[plan.assignedPlanKey]})`
    }
    default:
      return "Free plan"
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

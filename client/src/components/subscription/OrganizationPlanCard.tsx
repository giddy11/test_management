// components/subscription/OrganizationPlanCard.tsx — Settings > Plan, for an
// organisation's administrators: which plan they're on, when it ends, what's
// included and how to upgrade or renew. Payments are arranged with the team
// for now (bank transfer and so on), so upgrading is a "contact us".
import { Check, Lock, Mail, Phone } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InlineLoader } from "@/components/shared/PageLoader"
import { PlanBadge } from "@/components/subscription/PlanBadge"
import { CONTACT } from "@/components/landing/content"
import { useMyPlan } from "@/hooks/useSubscription"
import { planStatusText } from "@/lib/planStatus"
import type { FeatureKey, LimitKey } from "@/types/subscription.types"

const FEATURE_LABELS: Record<FeatureKey, string> = {
  it_requests: "IT requests (portal, catalog, approvals, IT queue)",
  whatsapp_widget: "WhatsApp widget on your website",
  sla_escalations: "SLA breach escalations",
  custom_roles: "Custom roles and permissions",
}

const LIMIT_LABELS: Record<LimitKey, string> = {
  full_seats: "Full seats",
  projects: "Projects",
  test_cases: "Test cases",
  client_companies: "Client companies",
  storage_gb: "Attachment storage (GB)",
  ai_credits_monthly: "AI credits each month",
  activity_log_days: "Activity log history (days)",
}

export function OrganizationPlanCard() {
  const { data: plan, isLoading, isError } = useMyPlan()

  if (isLoading) return <InlineLoader />
  if (isError || !plan) return <p className="text-sm text-muted-foreground">Your plan couldn&apos;t be loaded.</p>

  const ending =
    (plan.status === "active" && plan.paidUntil) || plan.status === "trial"
      ? new Date((plan.status === "trial" ? plan.trialEndsAt : plan.paidUntil) as string).getTime() - Date.now()
      : null
  const endsSoon = ending !== null && ending < 14 * 86_400_000

  return (
    <div className="space-y-4" data-cy="organization-plan">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>Your plan</CardTitle>
            <PlanBadge planKey={plan.planKey} name={plan.planName} />
          </div>
          <CardDescription>
            {planStatusText(plan)}
            {endsSoon && " — get in touch to renew so nothing is interrupted."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Features</h3>
            <ul className="space-y-2 text-sm">
              {(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => {
                const on = plan.features[key]
                return (
                  <li key={key} className="flex items-start gap-2">
                    {on ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Included" />
                    ) : (
                      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not included" />
                    )}
                    <span className={on ? undefined : "text-muted-foreground"}>{FEATURE_LABELS[key]}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Limits</h3>
            <dl className="space-y-2 text-sm">
              {(Object.keys(LIMIT_LABELS) as LimitKey[]).map((key) => (
                <div key={key} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{LIMIT_LABELS[key]}</dt>
                  <dd className="font-medium tabular-nums">
                    {plan.limits[key] === null ? "Unlimited" : plan.limits[key]?.toLocaleString()}
                    {key === "full_seats" && plan.extraSeats > 0 && plan.includedSeats !== null && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground" data-cy="plan-seat-breakdown">
                        ({plan.includedSeats.toLocaleString()} + {plan.extraSeats.toLocaleString()} extra)
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upgrade or renew</CardTitle>
          <CardDescription>
            Contact us to change plan or pay for another period. We accept bank transfer and other offline payments,
            and switch your plan on as soon as the payment is confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a href={`mailto:${CONTACT.email}`} className="inline-flex items-center gap-2 font-medium text-brand hover:underline">
            <Mail className="size-4" /> {CONTACT.email}
          </a>
          <a href={CONTACT.phoneHref} className="inline-flex items-center gap-2 font-medium text-brand hover:underline">
            <Phone className="size-4" /> {CONTACT.phone}
          </a>
        </CardContent>
      </Card>
    </div>
  )
}

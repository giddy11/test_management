// components/landing/PricingSection.tsx — the plans and prices, with a
// monthly / yearly switch. The content is edited by the platform owner on the
// Pricing page (pricing.manage) and fetched from the public API, so it changes
// without a deploy. PricingPlans is also the editor's live preview.
import { useState } from "react"
import { Link } from "react-router-dom"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Reveal } from "@/components/landing/Reveal"
import { SectionHeading } from "@/components/landing/SectionHeading"
import { usePublicPricing, visiblePlans } from "@/hooks/usePricing"
import { cn } from "@/lib/utils"
import type { BillingPeriod, PricingContent, PricingPlan } from "@/types/pricing.types"

function formatPrice(symbol: string, amount: number): string {
  const n = Number.isInteger(amount)
    ? amount.toLocaleString("en-US")
    : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${symbol}${n}`
}

// Paths inside the app use the router; anything else is an ordinary link.
function PlanCta({ plan }: { plan: PricingPlan }) {
  const variant = plan.highlighted ? "brand" : "outline"
  const isInternal = plan.ctaHref.startsWith("/") && !plan.ctaHref.startsWith("//")
  // Signing up from a plan's card starts that plan: Free, or a trial of it.
  const href =
    isInternal && plan.planKey && /^\/register\/?$/.test(plan.ctaHref) ? `/register?plan=${plan.planKey}` : plan.ctaHref
  return (
    <Button asChild variant={variant} size="lg" className="w-full">
      {isInternal ? (
        <Link to={href}>{plan.ctaLabel}</Link>
      ) : (
        <a
          href={plan.ctaHref}
          {...(plan.ctaHref.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {plan.ctaLabel}
        </a>
      )}
    </Button>
  )
}

function PlanCard({
  plan,
  period,
  currencySymbol,
}: {
  plan: PricingPlan
  period: BillingPeriod
  currencySymbol: string
}) {
  const isFree = plan.monthlyPrice === 0 && plan.yearlyPrice === 0
  const amount = period === "yearly" ? plan.yearlyPrice : plan.monthlyPrice
  const suffix = isFree ? "forever" : period === "yearly" ? "/ year" : "/ month"
  // seatLine has the plan's seat number filled in; older data only has the note.
  const seatText = plan.seatLine ?? plan.seatNote

  return (
    <div
      data-cy={`pricing-plan-${plan.id}`}
      className={cn(
        "relative flex h-full flex-col rounded-2xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8",
        plan.highlighted && "border-brand/60 bg-brand-soft/30 shadow-lg shadow-brand/10 ring-1 ring-brand/30",
      )}
    >
      {plan.badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-linear-to-r from-brand-strong to-brand px-3 py-1 text-xs font-semibold whitespace-nowrap text-brand-foreground shadow-sm">
          {plan.badge}
        </span>
      )}

      <h3 className="text-lg font-semibold">{plan.name}</h3>
      {plan.description && (
        <p className="mt-1.5 min-h-10 text-sm text-pretty text-muted-foreground">{plan.description}</p>
      )}

      <p className="mt-6 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight tabular-nums">
          {formatPrice(currencySymbol, amount)}
        </span>
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </p>
      {seatText && <p className="mt-2 text-sm text-muted-foreground">{seatText}</p>}

      <div className="mt-6">
        <PlanCta plan={plan} />
      </div>

      {plan.features.length > 0 && (
        <ul className="mt-8 space-y-3 border-t pt-6 text-sm">
          {plan.features.map((feature, i) => (
            <li key={`${i}-${feature}`} className="flex gap-3">
              <Check
                className={cn("mt-0.5 size-4 shrink-0", plan.highlighted ? "text-brand" : "text-emerald-600 dark:text-emerald-400")}
                aria-hidden
              />
              <span className="text-pretty">{feature}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BillingToggle({
  period,
  onChange,
  discountLabel,
}: {
  period: BillingPeriod
  onChange: (p: BillingPeriod) => void
  discountLabel: string
}) {
  const option = (value: BillingPeriod, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={period === value}
      onClick={() => onChange(value)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40",
        period === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {value === "yearly" && discountLabel && (
        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{discountLabel}</span>
      )}
    </button>
  )

  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      data-cy="pricing-billing-toggle"
      className="inline-flex rounded-full border bg-muted p-1"
    >
      {option("monthly", "Monthly")}
      {option("yearly", "Yearly")}
    </div>
  )
}

/** The switch, the cards and the footnote — no heading, no fetching. */
export function PricingPlans({ content, instant = false }: { content: PricingContent; instant?: boolean }) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly")
  // Plans switched off are left out, and the grid sizes itself to what is left.
  const plans = visiblePlans(content)
  const hasPaidPlan = plans.some((p) => p.monthlyPrice > 0 || p.yearlyPrice > 0)
  const cols = plans.length

  return (
    <div>
      {hasPaidPlan && (
        <div className="flex justify-center">
          <BillingToggle period={period} onChange={setPeriod} discountLabel={content.yearlyDiscountLabel} />
        </div>
      )}

      <div
        className={cn(
          "mx-auto mt-12 grid gap-6",
          cols === 1 && "max-w-md",
          cols === 2 && "max-w-4xl md:grid-cols-2",
          cols === 3 && "max-w-6xl md:grid-cols-2 lg:grid-cols-3",
          cols >= 4 && "md:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {plans.map((plan, i) => (
          <Reveal key={plan.id} delay={i * 80} instant={instant} className="h-full">
            <PlanCard plan={plan} period={period} currencySymbol={content.currencySymbol} />
          </Reveal>
        ))}
      </div>

      {/* Defines "full seat" for every plan's seat note. Kept out of the editable
          content so the term is explained even when the owner rewrites the notes. */}
      <p
        data-cy="pricing-seat-definition"
        className="mx-auto mt-8 max-w-3xl text-center text-sm text-pretty text-muted-foreground"
      >
        <span className="font-medium text-foreground">What is a full seat?</span> Anyone who works in ServiceDesk:
        testers, developers, IT agents and admins. People who only submit requests or tickets don&apos;t need one.
      </p>

      {content.footnote && (
        <p className="mx-auto mt-4 max-w-3xl text-center text-sm text-pretty text-muted-foreground">
          {content.footnote}
        </p>
      )}
    </div>
  )
}

function PricingSkeleton() {
  return (
    <div className="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-120 rounded-2xl" />
      ))}
    </div>
  )
}

export function PricingSection() {
  const { data, isLoading, isError } = usePublicPricing()

  // Hidden by the platform owner (or every plan is switched off), or the API is
  // down: leave the section out rather than show prices that might be wrong.
  if (isError || (data && (!data.isVisible || visiblePlans(data).length === 0))) return null

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="scroll-mt-16 border-b py-20 sm:py-24"
      data-cy="landing-pricing"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6">
        <SectionHeading
          id="pricing-heading"
          eyebrow={data?.eyebrow || "Pricing"}
          title={data?.heading ?? "Pricing"}
          lead={data?.subheading || undefined}
        />
        <div className="mt-10">
          {isLoading || !data ? <PricingSkeleton /> : <PricingPlans content={data} />}
        </div>
      </div>
    </section>
  )
}

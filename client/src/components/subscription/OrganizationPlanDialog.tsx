// components/subscription/OrganizationPlanDialog.tsx — the platform owner's
// view of one organisation's plan, opened from the Organisations page.
//
// - Record payment: a payment made offline (bank transfer, cash, ...). It is
//   logged, and the organisation moves onto the paid plan for the months it
//   covers. Paying again for the same plan early extends from the current end.
// - Change plan: by hand, with no payment — a trial, a complimentary plan, a
//   downgrade, or back to Free.
// - Payments: everything recorded for this organisation.
import { useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InlineLoader } from "@/components/shared/PageLoader"
import { PlanBadge } from "@/components/subscription/PlanBadge"
import { useOrganizationPlan, useRecordPayment, useSetOrganizationPlan } from "@/hooks/useSubscription"
import { usePricingSettings } from "@/hooks/usePricing"
import { CURRENCIES, currencyFor, formatAmount } from "@/lib/pricingCurrency"
import { PLAN_NAMES, addMonths, formatDate, fromDateInput, planStatusText, toDateInput } from "@/lib/planStatus"
import {
  PAYMENT_METHOD_LABELS,
  type EffectivePlan,
  type PaymentMethod,
  type PlanKey,
} from "@/types/subscription.types"

interface Props {
  organization: { organizationId: string; name: string }
  onClose: () => void
}

const MONTH_OPTIONS = [1, 3, 6, 12, 24]

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ── Record an offline payment ────────────────────────────────────────────────
function RecordPaymentForm({ organizationId, current }: { organizationId: string; current: EffectivePlan }) {
  const record = useRecordPayment(organizationId)
  const { data: pricing } = usePricingSettings()

  const [planKey, setPlanKey] = useState<"standard" | "enterprise">(
    current.assignedPlanKey === "enterprise" ? "enterprise" : "standard",
  )
  const [months, setMonths] = useState(1)
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState(() => currencyFor(pricing?.content.currencySymbol ?? "")?.code ?? "NGN")
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer")
  const [reference, setReference] = useState("")
  const [paidOn, setPaidOn] = useState(toDateInput(new Date()))
  const [note, setNote] = useState("")

  // What the price list says for this plan and length, as a suggestion.
  const suggestion = useMemo(() => {
    const content = pricing?.content
    const plan = content?.plans.find((p) => p.id === planKey)
    if (!content || !plan) return null
    const value = months === 12 ? plan.yearlyPrice : months % 12 === 0 ? plan.yearlyPrice * (months / 12) : plan.monthlyPrice * months
    if (!value) return null
    const code = currencyFor(content.currencySymbol)?.code ?? null
    return { value, code, label: formatAmount(content.currencySymbol, value) }
  }, [pricing, planKey, months])

  // The same rule the server uses: renewing the same plan early extends it.
  const extendsCurrent =
    current.status === "active" && current.assignedPlanKey === planKey && !!current.paidUntil && new Date(current.paidUntil) > new Date()
  const start = extendsCurrent ? new Date(current.paidUntil as string) : new Date()
  const end = addMonths(start, months)

  const amountNumber = Number(amount)
  const canSubmit = amount.trim() !== "" && amountNumber > 0 && /^[A-Za-z]{3}$/.test(currency) && !!paidOn

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        record.mutate(
          {
            planKey,
            amount: amountNumber,
            currency: currency.toUpperCase(),
            method,
            reference: reference.trim() || null,
            paidAt: fromDateInput(paidOn),
            months,
            note: note.trim() || null,
          },
          {
            onSuccess: () => {
              setAmount("")
              setReference("")
              setNote("")
            },
          },
        )
      }}
      data-cy="record-payment-form"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan paid for" htmlFor="pay-plan">
          <Select value={planKey} onValueChange={(v) => setPlanKey(v as "standard" | "enterprise")}>
            <SelectTrigger id="pay-plan" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Covers" htmlFor="pay-months">
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger id="pay-months" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} month{m === 1 ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Amount received" htmlFor="pay-amount">
          <Input
            id="pay-amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-cy="pay-amount"
          />
          {suggestion && (
            <button
              type="button"
              className="text-xs font-medium text-brand hover:underline"
              onClick={() => {
                setAmount(String(suggestion.value))
                if (suggestion.code) setCurrency(suggestion.code)
              }}
            >
              Price list: {suggestion.label}. Use this
            </button>
          )}
        </Field>
        <Field label="Currency" htmlFor="pay-currency">
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="pay-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} ({c.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Method" htmlFor="pay-method">
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            <SelectTrigger id="pay-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Reference" htmlFor="pay-ref">
          <Input
            id="pay-ref"
            value={reference}
            maxLength={120}
            placeholder="Transfer or receipt no."
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <Field label="Paid on" htmlFor="pay-date">
          <Input id="pay-date" type="date" value={paidOn} max={toDateInput(new Date())} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>

      <Field label="Note (optional)" htmlFor="pay-note">
        <Textarea id="pay-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        {PLAN_NAMES[planKey]} from <span className="font-medium">{start.toLocaleDateString()}</span> to{" "}
        <span className="font-medium">{end.toLocaleDateString()}</span>
        {extendsCurrent && <span className="text-muted-foreground"> (added on to the current paid period)</span>}
        {!extendsCurrent && current.status === "active" && current.assignedPlanKey !== planKey && (
          <span className="text-muted-foreground"> (replaces {PLAN_NAMES[current.assignedPlanKey]} from today)</span>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit || record.isPending} data-cy="record-payment">
          {record.isPending ? "Recording…" : "Record payment"}
        </Button>
      </div>
    </form>
  )
}

// ── Change the plan by hand ──────────────────────────────────────────────────
function ChangePlanForm({ organizationId, current }: { organizationId: string; current: EffectivePlan }) {
  const setPlan = useSetOrganizationPlan(organizationId)
  const [planKey, setPlanKey] = useState<PlanKey>(current.assignedPlanKey)
  const [status, setStatus] = useState<"active" | "trial">(current.status === "trial" ? "trial" : "active")
  const [trialEnds, setTrialEnds] = useState(
    // Defaults to the usual 14-day trial.
    current.trialEndsAt ? toDateInput(new Date(current.trialEndsAt)) : toDateInput(new Date(Date.now() + 14 * 86_400_000)),
  )
  const [paidUntil, setPaidUntil] = useState(current.paidUntil ? toDateInput(new Date(current.paidUntil)) : "")
  const [note, setNote] = useState(current.note ?? "")

  const isFree = planKey === "free"
  const canSubmit = isFree || status === "active" || !!trialEnds

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        setPlan.mutate({
          planKey,
          status: isFree ? "active" : status,
          trialEndsAt: !isFree && status === "trial" ? fromDateInput(trialEnds, true) : null,
          paidUntil: !isFree && status === "active" && paidUntil ? fromDateInput(paidUntil, true) : null,
          note: note.trim() || null,
        })
      }}
      data-cy="change-plan-form"
    >
      <p className="text-sm text-muted-foreground">
        For changes without a payment: a trial, a complimentary plan, or moving back to Free. To log money received, use
        Record payment instead.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan" htmlFor="set-plan">
          <Select value={planKey} onValueChange={(v) => setPlanKey(v as PlanKey)}>
            <SelectTrigger id="set-plan" className="w-full" data-cy="set-plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {!isFree && (
          <Field label="Type" htmlFor="set-status">
            <Select value={status} onValueChange={(v) => setStatus(v as "active" | "trial")}>
              <SelectTrigger id="set-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="active">Active (no payment)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {!isFree && status === "trial" && (
        <Field label="Trial ends on" htmlFor="set-trial" hint="After this date the organisation is back on Free automatically.">
          <Input id="set-trial" type="date" value={trialEnds} min={toDateInput(new Date())} onChange={(e) => setTrialEnds(e.target.value)} />
        </Field>
      )}
      {!isFree && status === "active" && (
        <Field
          label="Active until (optional)"
          htmlFor="set-until"
          hint="Leave empty for no end date, for example a complimentary or partner account."
        >
          <Input id="set-until" type="date" value={paidUntil} min={toDateInput(new Date())} onChange={(e) => setPaidUntil(e.target.value)} />
        </Field>
      )}
      {isFree && current.planKey !== "free" && (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          Features that Free doesn&apos;t include stop working straight away. Nothing is deleted, and they come back if the
          organisation moves up again.
        </p>
      )}

      <Field label="Note (optional)" htmlFor="set-note" hint="Only you see this, for example why the plan was given.">
        <Textarea id="set-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit || setPlan.isPending} data-cy="save-plan">
          {setPlan.isPending ? "Saving…" : "Save plan"}
        </Button>
      </div>
    </form>
  )
}

export function OrganizationPlanDialog({ organization, onClose }: Props) {
  const { data, isLoading, isError } = useOrganizationPlan(organization.organizationId)
  const current = data?.subscription

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-cy="org-plan-dialog">
        <DialogHeader>
          <DialogTitle>{organization.name}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {current ? (
                <>
                  <PlanBadge planKey={current.planKey} name={current.planName} />
                  <span>{planStatusText(current)}</span>
                </>
              ) : (
                <span>Plan and payments</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {isLoading && <InlineLoader />}
        {isError && <p className="text-sm text-destructive">Couldn&apos;t load this organisation&apos;s plan.</p>}

        {current && data && (
          <Tabs defaultValue="payment">
            <TabsList>
              <TabsTrigger value="payment">Record payment</TabsTrigger>
              <TabsTrigger value="plan">Change plan</TabsTrigger>
              <TabsTrigger value="history">Payments ({data.payments.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="payment" className="pt-2">
              <RecordPaymentForm organizationId={organization.organizationId} current={current} />
            </TabsContent>
            <TabsContent value="plan" className="pt-2">
              <ChangePlanForm key={`${current.assignedPlanKey}-${current.status}`} organizationId={organization.organizationId} current={current} />
            </TabsContent>
            <TabsContent value="history" className="pt-2">
              {data.payments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border text-sm" data-cy="payment-history">
                  {data.payments.map((p) => (
                    <li key={p.id} className="grid gap-1 p-3 sm:grid-cols-[1fr_auto]">
                      <div>
                        <div className="font-medium">
                          {p.currency} {p.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} · {p.planName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                          {p.reference && ` · Ref ${p.reference}`} · covers {formatDate(p.periodStart)} to {formatDate(p.periodEnd)}
                        </div>
                        {p.note && <div className="mt-1 text-xs text-muted-foreground">{p.note}</div>}
                      </div>
                      <div className="text-xs text-muted-foreground sm:text-right">Paid {formatDate(p.paidAt)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

// components/subscription/OrganizationPlanDialog.tsx — the platform owner's
// view of one organisation's plan, opened from the Organisations page.
//
// - Record payment: a payment made offline (bank transfer, cash, ...). It is
//   logged, and the organisation moves onto the paid plan for the months it
//   covers. Paying again for the same plan early extends from the current end.
//   "Covers: rest of the current period" adds seats without extending the plan.
// - Extra seats: full seats on top of what the plan includes, set when paying
//   or by hand. They last as long as the paid plan does.
// - Change plan: by hand, with no payment — a trial, a complimentary plan, a
//   downgrade, or back to Free.
// - Payments: everything recorded for this organisation.
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InlineLoader } from "@/components/shared/PageLoader"
import { PlanBadge } from "@/components/subscription/PlanBadge"
import { useOrganizationPlan, usePlanCatalog, useRecordPayment, useSetOrganizationPlan } from "@/hooks/useSubscription"
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

/** "15 included + 5 extra = 20 full seats", or null when the plan has no seat limit. */
function seatSummary(included: number | null, extra: number): string | null {
  if (included === null) return null
  const total = included + extra
  return `${included.toLocaleString()} included + ${extra.toLocaleString()} extra = ${total.toLocaleString()} full seat${total === 1 ? "" : "s"}`
}

/**
 * Each plan's own included seats, from the plan catalog (so choosing another plan in
 * the form shows that plan's seats). Falls back to the organisation's current plan
 * while the catalog loads.
 */
function useIncludedSeats(current: EffectivePlan) {
  const { data: catalog } = usePlanCatalog()
  return (planKey: PlanKey): number | null => {
    const value = catalog?.entitlements[planKey]?.limits.full_seats
    return value !== undefined ? value : current.includedSeats
  }
}

/** A whole number of seats, or null while the box is empty or not a valid count. */
function parseSeats(value: string): number | null {
  if (value.trim() === "") return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= 100_000 ? n : null
}

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
  const seatsFor = useIncludedSeats(current)
  const [months, setMonths] = useState(1)
  // The organisation's TOTAL extra seats after this payment.
  const [extraSeats, setExtraSeats] = useState(String(current.extraSeats))
  const [amount, setAmount] = useState("")
  // Payments start in dollars whatever the price list shows. "Use this" below
  // switches it to the price list's currency, because the suggested amount is in that.
  const [currency, setCurrency] = useState("USD")
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer")
  const [reference, setReference] = useState("")
  const [paidOn, setPaidOn] = useState(toDateInput(new Date()))
  const [note, setNote] = useState("")

  // The same rule the server uses: renewing the same plan early extends it.
  const extendsCurrent =
    current.status === "active" && current.assignedPlanKey === planKey && !!current.paidUntil && new Date(current.paidUntil) > new Date()
  // 0 months = extra seats only, for the rest of the period already running.
  const seatsOnly = months === 0 && extendsCurrent
  const monthsValue = months === 0 && !extendsCurrent ? 1 : months
  // Paying for the plan a running trial is of starts after the trial, so its days are kept.
  const keepsTrial =
    current.status === "trial" &&
    current.assignedPlanKey === planKey &&
    !!current.trialEndsAt &&
    new Date(current.trialEndsAt) > new Date()
  // Switching from another paid plan mid-period: it starts today, and the
  // suggestion takes off what was left of the old one.
  const switchesPaidPlan =
    current.status === "active" &&
    current.planKey !== "free" &&
    current.assignedPlanKey !== planKey &&
    !!current.paidUntil &&
    new Date(current.paidUntil) > new Date()
  const start = seatsOnly
    ? new Date()
    : extendsCurrent
      ? new Date(current.paidUntil as string)
      : keepsTrial
        ? new Date(current.trialEndsAt as string)
        : new Date()
  const end = seatsOnly ? new Date(current.paidUntil as string) : addMonths(start, monthsValue)

  // Seats only make sense when the plan has a seat limit to go beyond.
  const includedSeats = seatsFor(planKey)
  const showSeats = includedSeats !== null
  const seatsNumber = parseSeats(extraSeats)
  const seatsOk = !showSeats || seatsNumber !== null
  const seatText = showSeats && seatsNumber !== null ? seatSummary(includedSeats, seatsNumber) : null

  // What the price list says, as a suggestion: the plan for the months paid, plus
  // the extra seats at the plan's extra-seat price. A seats-only payment is just
  // the seats being added now, for the part of the period still to run.
  const suggestion = (() => {
    const content = pricing?.content
    const plan = content?.plans.find((p) => p.planKey === planKey) ?? content?.plans.find((p) => p.id === planKey)
    if (!content || !plan) return null
    const sym = content.currencySymbol
    const parts: { text: string; value: number }[] = []
    if (!seatsOnly) {
      const m = monthsValue
      const price = m === 12 ? plan.yearlyPrice : m % 12 === 0 ? plan.yearlyPrice * (m / 12) : plan.monthlyPrice * m
      if (price > 0) parts.push({ text: `${PLAN_NAMES[planKey]}, ${m} month${m === 1 ? "" : "s"}`, value: price })
    }
    const seatPrice = plan.extraSeatPrice ?? 0
    if (showSeats && seatsNumber !== null && seatPrice > 0) {
      if (seatsOnly) {
        const added = Math.max(0, seatsNumber - current.extraSeats)
        const monthsLeft = Math.round(((end.getTime() - start.getTime()) / (30 * 86_400_000)) * 10) / 10
        const value = Math.round(added * seatPrice * monthsLeft * 100) / 100
        if (added > 0 && value > 0) {
          parts.push({
            text: `${added} added seat${added === 1 ? "" : "s"} × ${formatAmount(sym, seatPrice)} × ${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left`,
            value,
          })
        }
      } else if (seatsNumber > 0) {
        parts.push({
          text: `${seatsNumber} extra seat${seatsNumber === 1 ? "" : "s"} × ${formatAmount(sym, seatPrice)} × ${monthsValue} month${monthsValue === 1 ? "" : "s"}`,
          value: Math.round(seatsNumber * seatPrice * monthsValue * 100) / 100,
        })
      }
    }
    // What was left of the plan being replaced, at its own price-list prices
    // (plan plus its extra seats), comes off.
    if (switchesPaidPlan && !seatsOnly) {
      const old =
        content.plans.find((p) => p.planKey === current.assignedPlanKey) ??
        content.plans.find((p) => p.id === current.assignedPlanKey)
      const monthsLeft = Math.round(((new Date(current.paidUntil as string).getTime() - Date.now()) / (30 * 86_400_000)) * 10) / 10
      if (old && monthsLeft > 0) {
        const credit =
          Math.round(((old.monthlyPrice ?? 0) + current.extraSeats * (old.extraSeatPrice ?? 0)) * monthsLeft * 100) / 100
        if (credit > 0) {
          parts.push({
            text: `Unused ${PLAN_NAMES[current.assignedPlanKey]} (${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left)`,
            value: -credit,
          })
        }
      }
    }
    // Never below nothing: a big credit just makes the switch free.
    const value = Math.max(0, Math.round(parts.reduce((sum, p) => sum + p.value, 0) * 100) / 100)
    if (!value && !parts.some((p) => p.value < 0)) return null
    return {
      value,
      code: currencyFor(sym)?.code ?? null,
      label: formatAmount(sym, value),
      breakdown:
        parts.length > 1 || seatsOnly
          ? parts
              .map((p, i) => `${i === 0 ? "" : p.value < 0 ? " − " : " + "}${p.text}: ${formatAmount(sym, Math.abs(p.value))}`)
              .join("")
          : "",
    }
  })()

  const amountNumber = Number(amount)
  const canSubmit =
    amount.trim() !== "" && amountNumber > 0 && /^[A-Za-z]{3}$/.test(currency) && !!paidOn && seatsOk

  return (
    <form
      className="flex min-h-full flex-col gap-4"
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
            months: monthsValue,
            extraSeats: showSeats && seatsNumber !== null ? seatsNumber : undefined,
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
          <Select value={String(monthsValue)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger id="pay-months" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {extendsCurrent && (
                <SelectItem value="0" data-cy="pay-covers-seats-only">
                  Rest of the current period (extra seats only)
                </SelectItem>
              )}
              {MONTH_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} month{m === 1 ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {showSeats && (
        <Field
          label="Extra seats"
          htmlFor="pay-seats"
          hint={
            seatText
              ? `The organisation's total extra seats from now on, not only the ones this payment is for. That makes ${seatText}.`
              : "The organisation's total extra seats from now on."
          }
        >
          <Input
            id="pay-seats"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={extraSeats}
            onChange={(e) => setExtraSeats(e.target.value)}
            aria-invalid={!seatsOk || undefined}
            className="sm:max-w-40"
            data-cy="pay-extra-seats"
          />
        </Field>
      )}

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
          {suggestion?.breakdown && (
            <p className="text-xs text-muted-foreground" data-cy="pay-suggestion-breakdown">
              {suggestion.breakdown}
            </p>
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
          <DatePicker id="pay-date" value={paidOn} max={toDateInput(new Date())} onChange={setPaidOn} />
        </Field>
      </div>

      <Field label="Note (optional)" htmlFor="pay-note">
        <Textarea id="pay-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        {seatsOnly ? "Extra seats on " : ""}
        {PLAN_NAMES[planKey]} from <span className="font-medium">{start.toLocaleDateString()}</span> to{" "}
        <span className="font-medium">{end.toLocaleDateString()}</span>
        {seatsOnly && <span className="text-muted-foreground"> (the plan itself is not extended)</span>}
        {extendsCurrent && !seatsOnly && <span className="text-muted-foreground"> (added on to the current paid period)</span>}
        {keepsTrial && <span className="text-muted-foreground"> (starts when the trial ends, so its remaining days are kept)</span>}
        {current.status === "trial" && !keepsTrial && current.assignedPlanKey !== planKey && (
          <span className="text-muted-foreground"> (ends the {PLAN_NAMES[current.assignedPlanKey]} trial today)</span>
        )}
        {seatText && <div className="mt-1 text-muted-foreground">{seatText}</div>}
        {!extendsCurrent && current.status === "active" && current.assignedPlanKey !== planKey && (
          <span className="text-muted-foreground">
            {" "}
            (replaces {PLAN_NAMES[current.assignedPlanKey]} from today{switchesPaidPlan ? "; the suggested amount takes off its unused time" : ""})
          </span>
        )}
      </div>

      <div className="mt-auto flex justify-end pt-2">
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
  const seatsFor = useIncludedSeats(current)
  const [extraSeats, setExtraSeats] = useState(String(current.extraSeats))
  const [note, setNote] = useState(current.note ?? "")

  const isFree = planKey === "free"
  const includedSeats = isFree ? null : seatsFor(planKey)
  const showSeats = !isFree && includedSeats !== null
  const seatsNumber = parseSeats(extraSeats)
  const seatText = showSeats && seatsNumber !== null ? seatSummary(includedSeats, seatsNumber) : null
  const canSubmit = (isFree || status === "active" || !!trialEnds) && (!showSeats || seatsNumber !== null)

  return (
    <form
      className="flex min-h-full flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        setPlan.mutate({
          planKey,
          status: isFree ? "active" : status,
          trialEndsAt: !isFree && status === "trial" ? fromDateInput(trialEnds, true) : null,
          paidUntil: !isFree && status === "active" && paidUntil ? fromDateInput(paidUntil, true) : null,
          extraSeats: isFree ? 0 : showSeats && seatsNumber !== null ? seatsNumber : undefined,
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
          <DatePicker id="set-trial" value={trialEnds} min={toDateInput(new Date())} onChange={setTrialEnds} />
        </Field>
      )}
      {!isFree && status === "active" && (
        <Field
          label="Active until (optional)"
          htmlFor="set-until"
          hint="Leave empty for no end date, for example a complimentary or partner account."
        >
          <DatePicker
            id="set-until"
            value={paidUntil}
            min={toDateInput(new Date())}
            onChange={setPaidUntil}
            clearable
            placeholder="No end date"
          />
        </Field>
      )}
      {showSeats && (
        <Field
          label="Extra seats"
          htmlFor="set-seats"
          hint={seatText ? `Seats on top of the plan's own, given without a payment. That makes ${seatText}.` : "Seats on top of the plan's own."}
        >
          <Input
            id="set-seats"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={extraSeats}
            onChange={(e) => setExtraSeats(e.target.value)}
            aria-invalid={seatsNumber === null || undefined}
            className="sm:max-w-40"
            data-cy="set-extra-seats"
          />
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

      <div className="mt-auto flex justify-end pt-2">
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
      <DialogContent className="flex h-[min(42rem,90vh)] flex-col overflow-hidden sm:max-w-2xl" data-cy="org-plan-dialog">
        <DialogHeader className="shrink-0">
          <DialogTitle>{organization.name}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {current ? (
                <>
                  {current.status !== "none" && <PlanBadge planKey={current.planKey} name={current.planName} />}
                  <span className={current.blocked ? "font-medium text-destructive" : undefined}>
                    {planStatusText(current)}
                    {current.blocked && " · locked until a plan is set"}
                  </span>
                  {current.extraSeats > 0 && current.includedSeats !== null && (
                    <span data-cy="org-plan-seats">
                      · {(current.includedSeats + current.extraSeats).toLocaleString()} full seats ({current.includedSeats.toLocaleString()} + {current.extraSeats.toLocaleString()} extra)
                    </span>
                  )}
                </>
              ) : (
                <span>Plan and payments</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-1 items-center justify-center">
            <InlineLoader />
          </div>
        )}
        {isError && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-destructive">Couldn&apos;t load this organisation&apos;s plan.</p>
          </div>
        )}

        {current && data && (
          <Tabs defaultValue="payment" className="min-h-0 flex-1">
            <TabsList className="shrink-0">
              <TabsTrigger value="payment">Record payment</TabsTrigger>
              <TabsTrigger value="plan">Change plan</TabsTrigger>
              <TabsTrigger value="history">Payments ({data.payments.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="payment" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-2">
              <RecordPaymentForm organizationId={organization.organizationId} current={current} />
            </TabsContent>
            <TabsContent value="plan" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-2">
              <ChangePlanForm key={`${current.assignedPlanKey}-${current.status}`} organizationId={organization.organizationId} current={current} />
            </TabsContent>
            <TabsContent value="history" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-2">
              {data.payments.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                </div>
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
                          {p.extraSeats > 0 && ` · ${p.extraSeats} extra seat${p.extraSeats === 1 ? "" : "s"}`}
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

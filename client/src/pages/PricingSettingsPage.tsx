// pages/PricingSettingsPage.tsx — platform owner only (pricing.manage).
// Edits the pricing section on the public landing page: the plans, their
// prices and the features each one lists. Nothing changes for visitors until
// Save; Preview shows the cards exactly as the landing page renders them.
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, Plus, RotateCcw, Save, Trash2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { SectionHeading } from "@/components/landing/SectionHeading"
import { CurrencyConvertDialog } from "@/components/pricing/CurrencyConvertDialog"
import { CURRENCIES, withCurrency } from "@/lib/pricingCurrency"
import { PricingPlans } from "@/components/landing/PricingSection"
import { usePricingSettings, useResetPricing, useSavePricing, visiblePlans } from "@/hooks/usePricing"
import { ApiError } from "@/transport/http"
import type { PricingContent, PricingPlan } from "@/types/pricing.types"

const MAX_PLANS = 4
const MAX_FEATURES = 15

function newPlan(): PricingPlan {
  return {
    id: `plan-${Date.now().toString(36)}`,
    name: "New plan",
    description: "",
    monthlyPrice: 0,
    yearlyPrice: 0,
    seatNote: "",
    features: ["A feature of this plan"],
    ctaLabel: "Get started",
    ctaHref: "/register",
    isVisible: true,
    highlighted: false,
    badge: "",
  }
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// "body.plans.1.features.2" → "Standard, feature 3"
function describeField(field: string, content: PricingContent): string {
  const parts = field.replace(/^body\./, "").split(".")
  if (parts[0] !== "plans" || parts.length < 2) return SECTION_LABELS[parts[0]] ?? parts[0]
  const index = Number(parts[1])
  const plan = content.plans[index]
  const planName = plan?.name?.trim() || `Plan ${index + 1}`
  if (parts[2] === "features" && parts[3] !== undefined) return `${planName}, feature ${Number(parts[3]) + 1}`
  return parts[2] ? `${planName}, ${PLAN_LABELS[parts[2]] ?? parts[2]}` : planName
}

const SECTION_LABELS: Record<string, string> = {
  plans: "Plans",
  heading: "Heading",
  eyebrow: "Small label",
  subheading: "Intro text",
  currencySymbol: "Currency symbol",
  yearlyDiscountLabel: "Yearly discount label",
  footnote: "Footnote",
}

const PLAN_LABELS: Record<string, string> = {
  name: "name",
  description: "description",
  monthlyPrice: "monthly price",
  yearlyPrice: "yearly price",
  seatNote: "seat note",
  features: "features",
  ctaLabel: "button text",
  ctaHref: "button link",
  badge: "badge",
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SectionSettings({
  draft,
  onChange,
  onCurrencyChange,
}: {
  draft: PricingContent
  onChange: (patch: Partial<PricingContent>) => void
  /** Asks the page to change currency, which opens the convert dialog. */
  onCurrencyChange: (symbol: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Section</CardTitle>
        <CardDescription>The heading and text around the plans.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            checked={draft.isVisible}
            onCheckedChange={(v) => onChange({ isVisible: v === true })}
            className="mt-0.5"
            data-cy="pricing-visible"
          />
          <span>
            <span className="block text-sm font-medium">Show pricing on the landing page</span>
            <span className="block text-xs text-muted-foreground">
              When off, the section and its link in the header are hidden from visitors.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Small label" htmlFor="pricing-eyebrow" hint="The pill above the heading.">
            <Input id="pricing-eyebrow" value={draft.eyebrow} maxLength={40} onChange={(e) => onChange({ eyebrow: e.target.value })} />
          </Field>
          <Field label="Currency" htmlFor="pricing-currency" hint="Shown in front of every price. Changing it offers to convert the prices for you.">
            <Select value={draft.currencySymbol} onValueChange={onCurrencyChange}>
              <SelectTrigger id="pricing-currency" className="w-full" data-cy="pricing-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* A symbol saved earlier that isn't in the list stays selectable. */}
                {!CURRENCIES.some((c) => c.symbol === draft.currencySymbol) && (
                  <SelectItem value={draft.currencySymbol}>{draft.currencySymbol}</SelectItem>
                )}
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.symbol}>
                    {c.symbol} — {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Heading" htmlFor="pricing-heading">
          <Input id="pricing-heading" value={draft.heading} maxLength={120} onChange={(e) => onChange({ heading: e.target.value })} />
        </Field>
        <Field label="Intro text" htmlFor="pricing-subheading">
          <Textarea id="pricing-subheading" rows={2} value={draft.subheading} maxLength={300} onChange={(e) => onChange({ subheading: e.target.value })} />
        </Field>
        <Field label="Yearly discount label" htmlFor="pricing-discount" hint="Shown next to Yearly, for example “2 months free”. Leave empty to hide it.">
          <Input id="pricing-discount" value={draft.yearlyDiscountLabel} maxLength={40} onChange={(e) => onChange({ yearlyDiscountLabel: e.target.value })} />
        </Field>
        <Field label="Footnote" htmlFor="pricing-footnote" hint="Small print under the plans: currency, tax, trial, discounts.">
          <Textarea id="pricing-footnote" rows={2} value={draft.footnote} maxLength={300} onChange={(e) => onChange({ footnote: e.target.value })} />
        </Field>
      </CardContent>
    </Card>
  )
}

function PriceInput({ id, value, onChange }: { id: string; value: number; onChange: (n: number) => void }) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  )
}

function PlanEditor({
  plan,
  index,
  count,
  currencySymbol,
  onChange,
  onMove,
  onRemove,
}: {
  plan: PricingPlan
  index: number
  count: number
  currencySymbol: string
  onChange: (patch: Partial<PricingPlan>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const fid = (name: string) => `plan-${plan.id}-${name}`
  const setFeature = (i: number, value: string) =>
    onChange({ features: plan.features.map((f, j) => (j === i ? value : f)) })

  return (
    <Card data-cy={`pricing-editor-plan-${index}`} className={plan.isVisible ? undefined : "bg-muted/40"}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate text-base">{plan.name.trim() || `Plan ${index + 1}`}</CardTitle>
          {!plan.isVisible && <Badge variant="secondary">Hidden</Badge>}
          {plan.highlighted && <Badge variant="outline">Highlighted</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move plan left">
            <ArrowLeft className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move plan right">
            <ArrowRight className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" disabled={count === 1} onClick={onRemove} aria-label="Remove plan">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            checked={plan.isVisible}
            onCheckedChange={(v) => onChange({ isVisible: v === true })}
            className="mt-0.5"
            data-cy={`pricing-plan-visible-${index}`}
          />
          <span>
            <span className="block text-sm font-medium">Show this plan on the landing page</span>
            <span className="block text-xs text-muted-foreground">
              Turn off to hide it from visitors. Everything you entered here is kept.
            </span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor={fid("name")}>
            <Input id={fid("name")} value={plan.name} maxLength={40} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label="Badge" htmlFor={fid("badge")} hint="For example “Most popular”. Leave empty for none.">
            <Input id={fid("badge")} value={plan.badge} maxLength={30} onChange={(e) => onChange({ badge: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" htmlFor={fid("description")}>
          <Input id={fid("description")} value={plan.description} maxLength={160} onChange={(e) => onChange({ description: e.target.value })} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Monthly price (${currencySymbol})`} htmlFor={fid("monthly")} hint="0 for a free plan.">
            <PriceInput id={fid("monthly")} value={plan.monthlyPrice} onChange={(n) => onChange({ monthlyPrice: n })} />
          </Field>
          <Field label={`Yearly price (${currencySymbol})`} htmlFor={fid("yearly")}>
            <PriceInput id={fid("yearly")} value={plan.yearlyPrice} onChange={(n) => onChange({ yearlyPrice: n })} />
            {plan.monthlyPrice > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-brand hover:underline"
                onClick={() => onChange({ yearlyPrice: Math.round(plan.monthlyPrice * 10 * 100) / 100 })}
              >
                Use 10 × monthly (2 months free)
              </button>
            )}
          </Field>
        </div>
        <Field label="Seat note" htmlFor={fid("seats")} hint="The line under the price, for example “Includes 15 full seats. Extra seats $2 each.”">
          <Input id={fid("seats")} value={plan.seatNote} maxLength={160} onChange={(e) => onChange({ seatNote: e.target.value })} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Button text" htmlFor={fid("cta")}>
            <Input id={fid("cta")} value={plan.ctaLabel} maxLength={40} onChange={(e) => onChange({ ctaLabel: e.target.value })} />
          </Field>
          <Field label="Button link" htmlFor={fid("href")} hint="/register, an https:// link or mailto:sales@…">
            <Input id={fid("href")} value={plan.ctaHref} maxLength={300} onChange={(e) => onChange({ ctaHref: e.target.value })} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={plan.highlighted} onCheckedChange={(v) => onChange({ highlighted: v === true })} />
          Highlight this plan (only one plan can be highlighted)
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Features</Label>
            <span className="text-xs text-muted-foreground">
              {plan.features.length} / {MAX_FEATURES}
            </span>
          </div>
          {plan.features.length === 0 && <p className="text-sm text-muted-foreground">No features listed.</p>}
          <ul className="space-y-2">
            {plan.features.map((feature, i) => (
              <li key={i} className="flex items-center gap-1">
                <Input
                  value={feature}
                  maxLength={120}
                  aria-label={`Feature ${i + 1}`}
                  onChange={(e) => setFeature(i, e.target.value)}
                />
                <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => onChange({ features: move(plan.features, i, i - 1) })} aria-label="Move feature up">
                  <ArrowUp className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" disabled={i === plan.features.length - 1} onClick={() => onChange({ features: move(plan.features, i, i + 1) })} aria-label="Move feature down">
                  <ArrowDown className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onChange({ features: plan.features.filter((_, j) => j !== i) })} aria-label="Remove feature">
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={plan.features.length >= MAX_FEATURES}
            onClick={() => onChange({ features: [...plan.features, ""] })}
          >
            <Plus className="size-4" /> Add feature
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function PricingSettingsPage() {
  const { data, isLoading, isError } = usePricingSettings()
  const save = useSavePricing()
  const reset = useResetPricing()
  const [draft, setDraft] = useState<PricingContent | null>(null)
  const [tab, setTab] = useState("edit")
  const [confirmReset, setConfirmReset] = useState(false)
  // The currency the owner picked, while the convert dialog is open.
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)

  // Start from what's saved, and again after every save or reset.
  useEffect(() => {
    if (data) setDraft(structuredClone(data.content))
  }, [data])

  const dirty = useMemo(
    () => !!data && !!draft && JSON.stringify(draft) !== JSON.stringify(data.content),
    [data, draft]
  )

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  if (isLoading || (!draft && !isError)) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (isError || !draft || !data) return <p className="text-sm text-destructive">Couldn't load the pricing settings.</p>

  const patch = (p: Partial<PricingContent>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const patchPlan = (index: number, p: Partial<PricingPlan>) =>
    setDraft((d) => {
      if (!d) return d
      const plans = d.plans.map((plan, i) => {
        if (i === index) return { ...plan, ...p }
        // Highlighting one plan un-highlights the others.
        return p.highlighted ? { ...plan, highlighted: false } : plan
      })
      return { ...d, plans }
    })

  const shownCount = visiblePlans(draft).length

  const saveError = save.error instanceof ApiError && save.error.errors.length > 0 ? save.error.errors : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-sm text-muted-foreground">
            The plans, prices and features shown on the public landing page. Visitors see changes as soon as you save.
          </p>
          <p className="mt-1 text-xs text-muted-foreground" data-cy="pricing-status">
            {data.isDefault
              ? "Showing the built-in defaults. Nothing has been saved yet."
              : `Last saved ${new Date(data.updatedAt ?? "").toLocaleString()}.`}
            {!draft.isVisible && " The section is hidden from visitors."}
            {draft.isVisible && shownCount === 0 && " Every plan is hidden, so the section is hidden too."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" disabled={data.isDefault || reset.isPending} onClick={() => setConfirmReset(true)}>
            <RotateCcw className="size-4" /> Reset to defaults
          </Button>
          <Button variant="outline" size="sm" disabled={!dirty} onClick={() => setDraft(structuredClone(data.content))}>
            <Undo2 className="size-4" /> Discard changes
          </Button>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)} data-cy="pricing-save">
            <Save className="size-4" /> {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {saveError && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-sm">
            <p className="font-medium text-destructive">Fix these before saving:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {saveError.map((e, i) => (
                <li key={i}>
                  <span className="font-medium text-foreground">{describeField(e.field, draft)}:</span> {e.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {draft.isVisible && shownCount === 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5" data-cy="pricing-none-visible">
          <CardContent className="py-4 text-sm">
            Every plan is turned off, so visitors won&apos;t see a pricing section at all. Turn on at least one plan to show it.
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="size-4" /> Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-6">
          <SectionSettings
            draft={draft}
            onChange={patch}
            onCurrencyChange={(symbol) => {
              if (symbol === draft.currencySymbol) return
              // With nothing to convert (every price is 0), there is nothing to ask.
              const hasPaidPlan = draft.plans.some((p) => p.monthlyPrice > 0 || p.yearlyPrice > 0)
              if (hasPaidPlan) setPendingCurrency(symbol)
              else setDraft(withCurrency(draft, symbol))
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Plans</h2>
              <p className="text-sm text-muted-foreground">
                Shown left to right in this order. {shownCount} of {draft.plans.length} shown. Up to {MAX_PLANS} plans.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={draft.plans.length >= MAX_PLANS}
              onClick={() => patch({ plans: [...draft.plans, newPlan()] })}
            >
              <Plus className="size-4" /> Add plan
            </Button>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {draft.plans.map((plan, i) => (
              <PlanEditor
                key={plan.id}
                plan={plan}
                index={i}
                count={draft.plans.length}
                currencySymbol={draft.currencySymbol}
                onChange={(p) => patchPlan(i, p)}
                onMove={(dir) => patch({ plans: move(draft.plans, i, i + dir) })}
                onRemove={() => patch({ plans: draft.plans.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <div className="rounded-2xl border bg-background px-4 py-12 sm:px-8" data-cy="pricing-preview">
            {(!draft.isVisible || shownCount === 0) && (
              <p className="mb-6 text-center text-sm text-muted-foreground">
                {draft.isVisible ? "Every plan is turned off, so visitors won't see this." : "The section is turned off, so visitors won't see this."}
              </p>
            )}
            <SectionHeading
              id="pricing-preview-heading"
              eyebrow={draft.eyebrow || "Pricing"}
              title={draft.heading || "Pricing"}
              lead={draft.subheading || undefined}
            />
            <div className="mt-10">
              <PricingPlans content={draft} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {pendingCurrency && (
        <CurrencyConvertDialog
          key={pendingCurrency}
          content={draft}
          toSymbol={pendingCurrency}
          onCancel={() => setPendingCurrency(null)}
          onApply={(next) => {
            setDraft(next)
            setPendingCurrency(null)
          }}
        />
      )}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset pricing to the defaults?"
        description="This replaces the saved plans, prices and features with the built-in defaults. Visitors will see the defaults straight away."
        confirmLabel="Reset"
        loading={reset.isPending}
        onConfirm={() => reset.mutate(undefined, { onSuccess: () => setConfirmReset(false) })}
      />
    </div>
  )
}

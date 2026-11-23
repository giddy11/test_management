// components/pricing/BenefitsMatrix.tsx — the Pricing editor's benefits: one
// shared list, a column of checkboxes per plan card. Ticking replaces typing
// the same line into every plan.
//
// Three kinds of row:
// - plain: the card shows the label when ticked.
// - app feature (IT requests, WhatsApp, SLA escalations, custom roles): on a
//   card that sells a real plan, the checkbox IS that plan's feature switch,
//   so the page can't promise what the app doesn't give.
// - plan limit (projects, test cases, storage...): written once with {n};
//   each card fills in its own plan's number from Plan limits, so changing a
//   number there changes the card too. The tick decides whether it shows.
//
// Rows show on the cards in this order. Drag the grip (or use the keyboard:
// Space to pick up, arrows to move, Space to drop) to reorder.
import { useEffect, useState } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Hash, Link2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  FEATURE_NAMES,
  LIMIT_NAMES,
  cardLine,
  isTicked,
  limitLine,
  newBenefitId,
  type PlanValues,
} from "@/lib/pricingBenefits"
import { cn } from "@/lib/utils"
import type { PricingBenefit, PricingContent, PricingPlan } from "@/types/pricing.types"
import type { FeatureKey, LimitKey, PlanKey } from "@/types/subscription.types"

const MAX_BENEFITS = 40

interface Props {
  content: PricingContent
  /** Each plan's features and limits as being edited; null when the viewer can't manage plans. */
  planValues: PlanValues
  onChange: (content: PricingContent) => void
  onFeatureChange: (planKey: PlanKey, feature: FeatureKey, on: boolean) => void
  /** Sets a plan's number for a limit (null = unlimited); the same draft the Plan limits tab edits. */
  onLimitChange: (planKey: PlanKey, limit: LimitKey, value: number | null) => void
}

function gridColumns(planCount: number) {
  return `2.25rem minmax(12rem,1fr) repeat(${planCount}, minmax(6rem,8rem)) 2.25rem`
}

/** A compact number box plus an "unlimited" tick for one plan's limit. */
function LimitInput({
  value,
  label,
  dataCy,
  onChange,
}: {
  value: number | null
  label: string
  dataCy: string
  onChange: (value: number | null) => void
}) {
  const unlimited = value === null
  const [text, setText] = useState(unlimited ? "" : String(value))

  useEffect(() => {
    if (value === null) {
      setText("")
      return
    }
    setText((prev) => (prev === "" && value === 0 ? "" : String(value)))
  }, [value])

  return (
    <div className="flex w-full items-center gap-1">
      <Input
        type="number"
        min={0}
        step={1}
        disabled={unlimited}
        value={unlimited ? "" : text}
        placeholder={unlimited ? "∞" : "0"}
        onChange={(e) => {
          const raw = e.target.value
          setText(raw)
          if (raw === "") {
            onChange(0)
            return
          }
          const n = Math.max(0, Math.floor(Number(raw)))
          if (!Number.isNaN(n)) {
            setText(String(n))
            onChange(n)
          }
        }}
        onBlur={() => {
          if (!unlimited && text === "") setText("0")
        }}
        aria-label={`${label}: number`}
        className="h-7 min-w-0 flex-1 px-2 text-center text-xs"
        data-cy={dataCy}
      />
      <Checkbox
        checked={unlimited}
        onCheckedChange={(v) => onChange(v === true ? null : 0)}
        aria-label={`${label}: unlimited`}
        title="Unlimited"
      />
    </div>
  )
}

interface RowProps {
  benefit: PricingBenefit
  index: number
  plans: PricingPlan[]
  planValues: PlanValues
  onEdit: (patch: Partial<PricingBenefit>) => void
  onToggle: (plan: PricingPlan, on: boolean) => void
  onLimitChange: (planKey: PlanKey, limit: LimitKey, value: number | null) => void
  onRemove: () => void
}

function BenefitRow({ benefit, index, plans, planValues, onEdit, onToggle, onLimitChange, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: benefit.id,
  })
  const linked = benefit.feature !== null || benefit.limit !== null

  return (
    <div
      ref={setNodeRef}
      style={{
        gridTemplateColumns: gridColumns(plans.length),
        transform: CSS.Transform.toString(transform && { ...transform, x: 0, scaleX: 1, scaleY: 1 }),
        transition,
      }}
      className={cn(
        "relative grid items-start gap-2 border-b bg-card py-2 last:border-0",
        isDragging && "z-10 rounded-md shadow-lg ring-1 ring-brand/50",
      )}
      data-cy="benefit-row"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder benefit ${index + 1}`}
        className={cn(
          "inline-flex size-8 touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <div className="min-w-0 space-y-1">
        <Input
          value={benefit.label}
          maxLength={120}
          onChange={(e) => onEdit({ label: e.target.value })}
          aria-label={`Benefit ${index + 1}`}
          className="h-8"
        />
        {benefit.limit && (
          <Input
            value={benefit.unlimitedLabel}
            maxLength={120}
            placeholder="When there's no limit, for example “Unlimited projects”"
            onChange={(e) => onEdit({ unlimitedLabel: e.target.value })}
            aria-label={`Benefit ${index + 1} when there's no limit`}
            className="h-8"
          />
        )}
        {benefit.feature && (
          <span className="inline-flex items-center gap-1 text-xs text-brand" data-cy="benefit-linked">
            <Link2 className="size-3" aria-hidden />
            Turns {FEATURE_NAMES[benefit.feature]} on or off in the app
          </span>
        )}
        {benefit.limit && (
          <span className="inline-flex items-center gap-1 text-xs text-brand" data-cy="benefit-limit">
            <Hash className="size-3" aria-hidden />
            Uses each plan&apos;s {LIMIT_NAMES[benefit.limit]} number
          </span>
        )}
      </div>

      {plans.map((plan) => {
        const enforced = benefit.feature !== null && plan.planKey !== null
        const limitVal = benefit.limit && plan.planKey && planValues ? planValues[plan.planKey]?.limits[benefit.limit] : undefined
        const zeroLimit = benefit.limit !== null && limitVal !== null && limitVal !== undefined && limitVal <= 0
        const ticked = isTicked(plan, benefit, planValues)
        const line = benefit.limit ? cardLine(plan, benefit, planValues) : null
        // Unticked: still show what ticking would print, faded, so the number is visible before choosing.
        const wouldShow =
          benefit.limit && plan.planKey && planValues && !ticked
            ? limitLine(benefit, planValues[plan.planKey]?.limits[benefit.limit] ?? null)
            : null
        return (
          <div key={plan.id} className="flex min-w-0 flex-col items-center gap-1 pt-1.5">
            <Checkbox
              checked={ticked}
              disabled={(enforced && planValues === null) || (benefit.limit !== null && (plan.planKey === null || zeroLimit))}
              onCheckedChange={(v) => onToggle(plan, v === true)}
              aria-label={`${benefit.label || `Benefit ${index + 1}`} on ${plan.name}`}
              data-cy={`benefit-${benefit.id}-${plan.id}`}
            />
            {/* The plan's number for this limit, editable here (the same value as on the Plan limits tab). */}
            {benefit.limit && plan.planKey && planValues && (
              <LimitInput
                value={planValues[plan.planKey]?.limits[benefit.limit] ?? null}
                label={`${LIMIT_NAMES[benefit.limit]} on ${plan.name}`}
                dataCy={`benefit-limit-${benefit.id}-${plan.id}`}
                onChange={(v) => {
                  onLimitChange(plan.planKey as PlanKey, benefit.limit as LimitKey, v)
                  // A 0 limit shows nothing on the card, so untick the box to match;
                  // entering a positive number (or unlimited) auto-ticks it.
                  if (v !== null && v <= 0 && ticked) onToggle(plan, false)
                  else if ((v === null || v > 0) && !ticked) onToggle(plan, true)
                }}
              />
            )}
            {benefit.limit && (
              <span
                className={cn(
                  "w-full truncate text-center text-[11px] leading-tight text-muted-foreground",
                  !ticked && "italic opacity-60",
                )}
                title={(ticked ? line : wouldShow) ?? undefined}
              >
                {plan.planKey === null ? "No plan" : zeroLimit ? "0 — enter >0 to show" : !ticked ? wouldShow ?? "" : line ?? ""}
              </span>
            )}
          </div>
        )
      })}

      {linked ? (
        <span
          className="inline-flex size-8 items-center justify-center text-muted-foreground/40"
          title={`Linked to ${benefit.feature ? "an app feature" : "a plan limit"}, so it stays. Reword it if you like.`}
        >
          <Trash2 className="size-4" aria-hidden />
        </span>
      ) : (
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onRemove} aria-label={`Remove benefit ${index + 1}`}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  )
}

export function BenefitsMatrix({ content, planValues, onChange, onFeatureChange, onLimitChange }: Props) {
  const [newLabel, setNewLabel] = useState("")
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const { benefits, plans } = content

  const setBenefits = (next: PricingBenefit[]) => onChange({ ...content, benefits: next })

  const toggle = (benefit: PricingBenefit, plan: PricingPlan, on: boolean) => {
    if (benefit.feature && plan.planKey) {
      onFeatureChange(plan.planKey, benefit.feature, on)
      return
    }
    onChange({
      ...content,
      plans: plans.map((p) =>
        p.id !== plan.id
          ? p
          : { ...p, benefitIds: on ? [...p.benefitIds, benefit.id] : p.benefitIds.filter((id) => id !== benefit.id) },
      ),
    })
  }

  const remove = (benefit: PricingBenefit) =>
    onChange({
      ...content,
      benefits: benefits.filter((b) => b.id !== benefit.id),
      plans: plans.map((p) => ({ ...p, benefitIds: p.benefitIds.filter((id) => id !== benefit.id) })),
    })

  const add = () => {
    const label = newLabel.trim()
    if (!label || benefits.length >= MAX_BENEFITS) return
    const id = newBenefitId(label, benefits.map((b) => b.id))
    setBenefits([...benefits, { id, label, feature: null, limit: null, unlimitedLabel: "" }])
    setNewLabel("")
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = benefits.findIndex((b) => b.id === active.id)
    const to = benefits.findIndex((b) => b.id === over.id)
    if (from >= 0 && to >= 0) setBenefits(arrayMove(benefits, from, to))
  }

  const shownOn = (plan: PricingPlan) => benefits.filter((b) => cardLine(plan, b, planValues) !== null).length

  return (
    <Card data-cy="benefits-matrix">
      <CardHeader>
        <CardTitle className="text-base">Benefits</CardTitle>
        <CardDescription>
          Tick what each plan includes. Cards list the ticked benefits in this order; drag the grip to reorder.
          Rows with a link switch that app feature on or off for the plan. Rows with a # take each plan&apos;s number from
          Plan limits, so you set a number once and every card follows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <div className="min-w-[38rem]">
            <div
              className="grid items-end gap-2 border-b pb-2 text-xs font-medium text-muted-foreground"
              style={{ gridTemplateColumns: gridColumns(plans.length) }}
            >
              <span />
              <span>Benefit</span>
              {plans.map((p) => (
                <span key={p.id} className={cn("text-center", !p.isVisible && "opacity-50")}>
                  <span className="block truncate font-semibold text-foreground">{p.name || "Plan"}</span>
                  {shownOn(p)} shown{!p.isVisible && " · hidden"}
                </span>
              ))}
              <span />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={benefits.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {benefits.map((benefit, i) => (
                  <BenefitRow
                    key={benefit.id}
                    benefit={benefit}
                    index={i}
                    plans={plans}
                    planValues={planValues}
                    onEdit={(patch) => setBenefits(benefits.map((b) => (b.id === benefit.id ? { ...b, ...patch } : b)))}
                    onToggle={(plan, on) => toggle(benefit, plan, on)}
                    onLimitChange={onLimitChange}
                    onRemove={() => remove(benefit)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {plans.some((p) => p.planKey === null) && (
          <p className="text-xs text-muted-foreground">
            A card that doesn&apos;t sell a plan in the app has no plan limits, so # rows don&apos;t show on it, and its
            feature rows are plain ticks.
          </p>
        )}

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Input
            value={newLabel}
            maxLength={120}
            placeholder="New benefit, for example “Dedicated account manager”"
            onChange={(e) => setNewLabel(e.target.value)}
            className="max-w-md flex-1"
            aria-label="New benefit"
            data-cy="new-benefit"
          />
          <Button type="submit" variant="outline" size="sm" disabled={!newLabel.trim() || benefits.length >= MAX_BENEFITS}>
            <Plus className="size-4" /> Add benefit
          </Button>
          <span className="text-xs text-muted-foreground">
            {benefits.length} / {MAX_BENEFITS}
          </span>
        </form>
      </CardContent>
    </Card>
  )
}


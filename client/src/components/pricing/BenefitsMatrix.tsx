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
import { useState } from "react"
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
  newBenefitId,
  type PlanValues,
} from "@/lib/pricingBenefits"
import { cn } from "@/lib/utils"
import type { PricingBenefit, PricingContent, PricingPlan } from "@/types/pricing.types"
import type { FeatureKey, PlanKey } from "@/types/subscription.types"

const MAX_BENEFITS = 40

interface Props {
  content: PricingContent
  /** Each plan's features and limits as being edited; null when the viewer can't manage plans. */
  planValues: PlanValues
  onChange: (content: PricingContent) => void
  onFeatureChange: (planKey: PlanKey, feature: FeatureKey, on: boolean) => void
}

function gridColumns(planCount: number) {
  return `2.25rem minmax(12rem,1fr) repeat(${planCount}, minmax(5rem,8rem)) 2.25rem`
}

interface RowProps {
  benefit: PricingBenefit
  index: number
  plans: PricingPlan[]
  planValues: PlanValues
  onEdit: (patch: Partial<PricingBenefit>) => void
  onToggle: (plan: PricingPlan, on: boolean) => void
  onRemove: () => void
}

function BenefitRow({ benefit, index, plans, planValues, onEdit, onToggle, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: benefit.id,
  })
  const linked = benefit.feature !== null || benefit.limit !== null
  const missingN = benefit.limit !== null && !benefit.label.includes("{n}")

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
          aria-invalid={missingN || undefined}
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
          <span
            className={cn("inline-flex items-center gap-1 text-xs", missingN ? "text-destructive" : "text-brand")}
            data-cy="benefit-limit"
          >
            <Hash className="size-3" aria-hidden />
            {missingN
              ? "Put {n} where the plan's number goes"
              : `{n} is each plan's number for ${LIMIT_NAMES[benefit.limit]} in Plan limits`}
          </span>
        )}
      </div>

      {plans.map((plan) => {
        const enforced = benefit.feature !== null && plan.planKey !== null
        const ticked = isTicked(plan, benefit, planValues)
        const line = benefit.limit ? cardLine(plan, benefit, planValues) : null
        return (
          <div key={plan.id} className="flex min-w-0 flex-col items-center gap-1 pt-1.5">
            <Checkbox
              checked={ticked}
              disabled={(enforced && planValues === null) || (benefit.limit !== null && plan.planKey === null)}
              onCheckedChange={(v) => onToggle(plan, v === true)}
              aria-label={`${benefit.label || `Benefit ${index + 1}`} on ${plan.name}`}
              data-cy={`benefit-${benefit.id}-${plan.id}`}
            />
            {/* What a limit row prints on this card, so the wording can be checked here. */}
            {benefit.limit && (
              <span className="w-full truncate text-center text-[11px] leading-tight text-muted-foreground" title={line ?? undefined}>
                {plan.planKey === null ? "No plan" : !ticked ? "" : line ?? "Hidden (0)"}
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

export function BenefitsMatrix({ content, planValues, onChange, onFeatureChange }: Props) {
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
          <div className="min-w-[36rem]">
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


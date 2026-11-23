// components/subscription/PlanEntitlementsEditor.tsx — each plan's limits
// (seats, projects, storage...). Which features a plan includes is ticked in
// the Benefits grid on the Edit tab; both are saved by the Pricing page's
// single Save button.
import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PlanBadge } from "@/components/subscription/PlanBadge"
import { durationText } from "@/lib/pricingBenefits"
import type { LimitKey, PlanCatalog, PlanEntitlements, PlanKey } from "@/types/subscription.types"

interface Props {
  catalog: PlanCatalog
  draft: Record<PlanKey, PlanEntitlements>
  onLimitChange: (plan: PlanKey, key: LimitKey, value: number | null) => void
}

function PlanLimitCell({
  value,
  ariaLabel,
  asDays = false,
  onChange,
}: {
  value: number | null
  ariaLabel: string
  /** The number is days: show what it means in years or months underneath. */
  asDays?: boolean
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
    <div className="space-y-1.5">
      <Input
        type="number"
        min={0}
        step={1}
        disabled={unlimited}
        value={unlimited ? "" : text}
        placeholder={unlimited ? "Unlimited" : "0"}
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
        aria-label={ariaLabel}
        className="h-8"
      />
      {asDays && value !== null && value > 0 && (
        <p className="text-xs text-muted-foreground" data-cy="limit-days-hint">
          = {durationText(value)}
        </p>
      )}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Checkbox checked={unlimited} onCheckedChange={(v) => onChange(v === true ? null : 0)} />
        Unlimited
      </label>
    </div>
  )
}

export function PlanEntitlementsEditor({ catalog, draft, onLimitChange }: Props) {
  const cols = `minmax(12rem,1.6fr) repeat(${catalog.plans.length}, minmax(7.5rem,1fr))`

  return (
    <Card data-cy="plan-limits">
      <CardHeader>
        <CardTitle className="text-base">Limits</CardTitle>
        <CardDescription>
          The numbers the pricing cards show through the # benefits on the Edit tab, so change a number here and the
          cards follow. Not checked in the app yet: enforcing them is the next step. Tick Unlimited for no limit.
          Features are ticked in the Benefits list on the Edit tab.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[36rem]">
          <div className="grid items-end gap-3 border-b pb-2" style={{ gridTemplateColumns: cols }}>
            <span />
            {catalog.plans.map((p) => (
              <div key={p.key} className="text-center">
                <PlanBadge planKey={p.key} name={p.name} />
              </div>
            ))}
          </div>
          {catalog.limits.map((l) => (
            <div key={l.key} className="grid items-center gap-3 border-b py-3 last:border-0" style={{ gridTemplateColumns: cols }}>
              <div className="text-sm font-medium">
                {l.label} <span className="text-xs font-normal text-muted-foreground">({l.unit})</span>
              </div>
              {catalog.plans.map((p) => (
                <PlanLimitCell
                  key={p.key}
                  value={draft[p.key].limits[l.key]}
                  ariaLabel={`${l.label} on ${p.name}`}
                  asDays={l.key === "activity_log_days"}
                  onChange={(v) => onLimitChange(p.key, l.key, v)}
                />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

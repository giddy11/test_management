// components/pricing/CurrencyConvertDialog.tsx — opens when the platform owner
// picks a different currency on the Pricing page. Prices are plain numbers, so
// the symbol alone would turn "$9" into "₦9"; this asks for a rate and a
// rounding, shows every old and new price, and only changes the draft. Nothing
// reaches visitors until Save.
import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ROUNDING_STEPS,
  convertPlans,
  convertTexts,
  currencyFor,
  defaultRounding,
  formatAmount,
  suggestedRate,
  textMentioning,
  withCurrency,
} from "@/lib/pricingCurrency"
import type { PricingContent } from "@/types/pricing.types"

interface Props {
  /** The draft being edited, still in the old currency. */
  content: PricingContent
  /** The symbol the owner picked. */
  toSymbol: string
  /** Closes without changing anything. */
  onCancel: () => void
  /** Receives the draft with the new currency (and converted prices, if asked). */
  onApply: (next: PricingContent) => void
}

function label(symbol: string): string {
  const c = currencyFor(symbol)
  return c ? `${symbol} (${c.code})` : symbol
}

// Mount it only while it's needed (give it a key per target currency) so the
// rate starts from the agreed one each time it opens.
export function CurrencyConvertDialog({ content, toSymbol, onCancel, onApply }: Props) {
  const fromSymbol = content.currencySymbol
  const [rate, setRate] = useState(() => {
    const r = suggestedRate(fromSymbol, toSymbol)
    return r === null ? "" : String(r)
  })
  // null = follow the automatic choice, which changes with the rate.
  const [stepOverride, setStepOverride] = useState<number | null>(null)
  // Amounts written inside sentences, like "Extra seats $2 each".
  const [convertWrittenText, setConvertWrittenText] = useState(true)

  const rateNumber = Number(rate)
  const rateOk = rate.trim() !== "" && Number.isFinite(rateNumber) && rateNumber > 0
  const step = stepOverride ?? (rateOk ? defaultRounding(rateNumber) : 1)

  const conversions = useMemo(
    () => (rateOk ? convertPlans(content.plans, rateNumber, step) : []),
    [content.plans, rateOk, rateNumber, step],
  )
  // What the written text would become, and what would still name the old currency.
  const textResult = useMemo(
    () => (rateOk && convertWrittenText ? convertTexts(content, fromSymbol, toSymbol, rateNumber, step) : null),
    [content, fromSymbol, toSymbol, rateOk, rateNumber, step, convertWrittenText],
  )
  const stale = useMemo(
    () => textMentioning(textResult?.content ?? content, fromSymbol),
    [textResult, content, fromSymbol],
  )
  const textMentionsOld = useMemo(() => textMentioning(content, fromSymbol).length > 0, [content, fromSymbol])
  const hasPaidPlan = content.plans.some((p) => p.monthlyPrice > 0 || p.yearlyPrice > 0)

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-cy="currency-dialog">
        <DialogHeader>
          <DialogTitle>Change currency to {label(toSymbol)}?</DialogTitle>
          <DialogDescription>
            Prices are just numbers, so changing the symbol alone would turn {formatAmount(fromSymbol, 9)} into{" "}
            {formatAmount(toSymbol, 9)}. Convert them now, or change the symbol and retype each price yourself.
            Nothing is saved until you press Save on the Pricing page.
          </DialogDescription>
        </DialogHeader>

        {hasPaidPlan && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="currency-rate">Exchange rate</Label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="shrink-0 whitespace-nowrap">1 {fromSymbol} =</span>
                  <Input
                    id="currency-rate"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    data-cy="currency-rate"
                  />
                  <span className="shrink-0">{toSymbol}</span>
                </div>
                {!rateOk && <p className="text-xs text-destructive">Enter a rate greater than 0.</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency-rounding">Round prices to</Label>
                <Select value={String(step)} onValueChange={(v) => setStepOverride(Number(v))}>
                  <SelectTrigger id="currency-rounding" className="w-full" data-cy="currency-rounding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUNDING_STEPS.map((r) => (
                      <SelectItem key={r.step} value={String(r.step)}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm" data-cy="currency-preview">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium">Monthly</th>
                    <th className="px-3 py-2 font-medium">Yearly</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {conversions.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2">
                        {c.name.trim() || "Unnamed plan"}
                        {!c.isVisible && <span className="ml-2 text-xs text-muted-foreground">(hidden)</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <span className="text-muted-foreground">{formatAmount(fromSymbol, c.monthlyFrom)}</span>
                        {" → "}
                        <span className="font-medium">{formatAmount(toSymbol, c.monthlyTo)}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <span className="text-muted-foreground">{formatAmount(fromSymbol, c.yearlyFrom)}</span>
                        {" → "}
                        <span className="font-medium">{formatAmount(toSymbol, c.yearlyTo)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              A yearly price that was 10 × monthly stays 10 × monthly after rounding, so “2 months free” stays true.
            </p>

            {textMentionsOld && (
              <div className="space-y-2">
                <label className="flex items-start gap-3 rounded-lg border p-3">
                  <Checkbox
                    checked={convertWrittenText}
                    onCheckedChange={(v) => setConvertWrittenText(v === true)}
                    className="mt-0.5"
                    data-cy="currency-convert-text"
                  />
                  <span>
                    <span className="block text-sm font-medium">Also convert amounts written in the text</span>
                    <span className="block text-xs text-muted-foreground">
                      Changes things like “Extra seats {formatAmount(fromSymbol, 2)} each” using the same rate and
                      rounding, and the currency code in sentences like “Prices in {currencyFor(fromSymbol)?.code ?? "USD"}”.
                    </span>
                  </span>
                </label>

                {textResult && textResult.changes.length > 0 && (
                  <ul className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm" data-cy="currency-text-changes">
                    {textResult.changes.map((c) => (
                      <li key={c.where}>
                        <span className="text-xs font-medium text-muted-foreground">{c.where}</span>
                        <p className="text-muted-foreground line-through decoration-muted-foreground/40">{c.before}</p>
                        <p>{c.after}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {stale.length > 0 && (
          <div
            className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm"
            data-cy="currency-stale"
          >
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
              {textResult ? "Reword these yourself — they still name" : "Written text that still names"} {label(fromSymbol)}:
            </p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {stale.map((s, i) => (
                <li key={i}>
                  <span className="font-medium text-foreground">{s.where}:</span> “{s.text}”
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel} data-cy="currency-cancel">
            Cancel
          </Button>
          <Button variant="outline" onClick={() => onApply(withCurrency(content, toSymbol))} data-cy="currency-symbol-only">
            Change symbol only
          </Button>
          {hasPaidPlan && (
            <Button
              disabled={!rateOk}
              onClick={() => onApply(
                  withCurrency(
                    content,
                    toSymbol,
                    conversions,
                    convertWrittenText ? { rate: rateNumber, step } : undefined,
                  ),
                )}
              data-cy="currency-convert"
            >
              Convert prices
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

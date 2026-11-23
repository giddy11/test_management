// lib/pricingCurrency.ts — the currencies the pricing editor offers, and the
// arithmetic for moving a set of prices from one to another.
//
// Prices are stored as plain numbers with a symbol in front, so changing the
// symbol alone leaves "$9" as "₦9". The editor's convert step uses these
// functions to recalculate every price once, with the rate and rounding the
// platform owner picks, and shows the result before anything is saved.
import type { PricingContent, PricingPlan } from "@/types/pricing.types"

export interface Currency {
  /** What is saved, and shown in front of every price. */
  symbol: string
  name: string
  code: string
}

export const CURRENCIES: Currency[] = [
  { symbol: "$", name: "US dollar", code: "USD" },
  { symbol: "€", name: "Euro", code: "EUR" },
  { symbol: "£", name: "British pound", code: "GBP" },
  { symbol: "₦", name: "Nigerian naira", code: "NGN" },
  { symbol: "GH₵", name: "Ghanaian cedi", code: "GHS" },
  { symbol: "KSh", name: "Kenyan shilling", code: "KES" },
  { symbol: "R", name: "South African rand", code: "ZAR" },
  { symbol: "₹", name: "Indian rupee", code: "INR" },
  { symbol: "C$", name: "Canadian dollar", code: "CAD" },
  { symbol: "A$", name: "Australian dollar", code: "AUD" },
]

export function currencyFor(symbol: string): Currency | undefined {
  return CURRENCIES.find((c) => c.symbol === symbol)
}

// Rates the team has agreed on: how many of the second currency one of the
// first buys. Every other pair is typed in, because a rate we hard-code goes
// stale the moment the market moves.
const AGREED_RATES: Record<string, number> = { "USD>NGN": 1600 }

/** The agreed rate for this pair (in either direction), or null if there isn't one. */
export function suggestedRate(fromSymbol: string, toSymbol: string): number | null {
  const from = currencyFor(fromSymbol)?.code
  const to = currencyFor(toSymbol)?.code
  if (!from || !to) return null
  const direct = AGREED_RATES[`${from}>${to}`]
  if (direct) return direct
  const inverse = AGREED_RATES[`${to}>${from}`]
  return inverse ? 1 / inverse : null
}

export const ROUNDING_STEPS = [
  { step: 0.01, label: "No rounding (cents)" },
  { step: 1, label: "Nearest 1" },
  { step: 5, label: "Nearest 5" },
  { step: 10, label: "Nearest 10" },
  { step: 50, label: "Nearest 50" },
  { step: 100, label: "Nearest 100" },
  { step: 500, label: "Nearest 500" },
  { step: 1000, label: "Nearest 1,000" },
]

/** A sensible default so prices land on tidy numbers: big currencies round big. */
export function defaultRounding(rate: number): number {
  if (rate >= 500) return 100
  if (rate >= 50) return 10
  return 1
}

export function roundTo(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(2))
}

export function formatAmount(symbol: string, amount: number): string {
  const n = amount.toLocaleString("en-US", { maximumFractionDigits: 2 })
  return `${symbol}${n}`
}

export interface PlanConversion {
  id: string
  name: string
  isVisible: boolean
  monthlyFrom: number
  monthlyTo: number
  yearlyFrom: number
  yearlyTo: number
}

/**
 * New prices for every plan, hidden ones included. A yearly price that was
 * exactly 10 × monthly (the "2 months free" pattern) stays that way, so the
 * promise on the page doesn't drift after rounding. Any other yearly price is
 * converted on its own.
 */
export function convertPlans(plans: PricingPlan[], rate: number, step: number): PlanConversion[] {
  return plans.map((p) => {
    const monthlyTo = roundTo(p.monthlyPrice * rate, step)
    const keepsTwoMonthsFree = p.monthlyPrice > 0 && p.yearlyPrice === p.monthlyPrice * 10
    const yearlyTo = keepsTwoMonthsFree ? Number((monthlyTo * 10).toFixed(2)) : roundTo(p.yearlyPrice * rate, step)
    return {
      id: p.id,
      name: p.name,
      isVisible: p.isVisible !== false,
      monthlyFrom: p.monthlyPrice,
      monthlyTo,
      yearlyFrom: p.yearlyPrice,
      yearlyTo,
    }
  })
}

/** The draft with the new symbol and, when given, the converted prices and text. */
export function withCurrency(
  content: PricingContent,
  symbol: string,
  conversions?: PlanConversion[],
  text?: { rate: number; step: number },
): PricingContent {
  let next: PricingContent = { ...content, currencySymbol: symbol }
  if (conversions) {
    const byId = new Map(conversions.map((c) => [c.id, c]))
    next = {
      ...next,
      plans: next.plans.map((p) => {
        const c = byId.get(p.id)
        return c ? { ...p, monthlyPrice: c.monthlyTo, yearlyPrice: c.yearlyTo } : p
      }),
    }
  }
  if (text) next = convertTexts(next, content.currencySymbol, symbol, text.rate, text.step).content
  return next
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export interface TextChange {
  where: string
  before: string
  after: string
}

// Every piece of written text on the page, in the order they appear, with a
// label for each. fn gets the label and the text and returns the text to keep.
function mapTexts(
  content: PricingContent,
  fn: (where: string, text: string) => string,
): { content: PricingContent; changes: TextChange[] } {
  const changes: TextChange[] = []
  const run = (where: string, text: string) => {
    const after = fn(where, text)
    if (after !== text) changes.push({ where, before: text, after })
    return after
  }
  const next: PricingContent = {
    ...content,
    subheading: run("Intro text", content.subheading),
    footnote: run("Footnote", content.footnote),
    yearlyDiscountLabel: run("Yearly discount label", content.yearlyDiscountLabel),
    plans: content.plans.map((p, i) => {
      const who = p.name.trim() || `Plan ${i + 1}`
      return {
        ...p,
        description: run(`${who}: description`, p.description),
        seatNote: run(`${who}: seat note`, p.seatNote),
        badge: run(`${who}: badge`, p.badge),
        features: p.features.map((f, j) => run(`${who}: feature ${j + 1}`, f)),
      }
    }),
  }
  return { content: next, changes }
}

// An amount written in text: the symbol straight before a number, not tacked
// onto a word ("R" in "Free"). Captures the number, with or without commas.
function amountPattern(symbol: string): RegExp {
  return new RegExp(
    String.raw`(?<![A-Za-z0-9])${escapeRegExp(symbol)}\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`,
    "g",
  )
}

/**
 * Text with its amounts and currency code moved to the new currency:
 * "Extra seats $2 each" becomes "Extra seats ₦3,200 each", and "Prices in USD"
 * becomes "Prices in NGN". Amounts use the same rate and rounding as the prices.
 */
export function convertText(text: string, from: string, to: string, rate: number, step: number): string {
  let out = text.replace(amountPattern(from), (_match, num: string) => {
    const original = Number(num.replace(/,/g, ""))
    let converted = roundTo(original * rate, step)
    // A small amount must never round away to nothing.
    if (converted === 0 && original > 0) converted = Number((original * rate).toFixed(2))
    return formatAmount(to, converted)
  })
  const fromCode = currencyFor(from)?.code
  const toCode = currencyFor(to)?.code
  if (fromCode && toCode) out = out.replace(new RegExp(String.raw`\b${fromCode}\b`, "g"), toCode)
  return out
}

/** Every text on the page converted, with the list of what changed for review. */
export function convertTexts(
  content: PricingContent,
  from: string,
  to: string,
  rate: number,
  step: number,
): { content: PricingContent; changes: TextChange[] } {
  return mapTexts(content, (_where, text) => convertText(text, from, to, rate, step))
}

export interface StaleText {
  where: string
  text: string
}

/** Written text that still names the given currency (an amount, or its code). */
export function textMentioning(content: PricingContent, symbol: string): StaleText[] {
  const amount = amountPattern(symbol)
  const code = currencyFor(symbol)?.code
  const codeWord = code ? new RegExp(String.raw`\b${code}\b`) : null
  const found: StaleText[] = []
  mapTexts(content, (where, text) => {
    amount.lastIndex = 0
    if (text && (amount.test(text) || (codeWord?.test(text) ?? false))) found.push({ where, text })
    return text
  })
  return found
}

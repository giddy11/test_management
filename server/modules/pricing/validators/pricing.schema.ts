// modules/pricing/validators/pricing.schema.ts
import { z } from "zod";
import { FEATURES, LIMITS, PLAN_KEYS } from "../../subscription/domain/planCatalog";

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1, "Required").max(max);

// A path inside the app, an https:// link or a mailto: link. "//host" is a
// protocol-relative URL to another site, so it isn't treated as a path.
const ctaHref = z
  .string()
  .trim()
  .min(1, "Required")
  .max(300)
  .refine(
    (v) => (v.startsWith("/") && !v.startsWith("//")) || /^https:\/\/\S+$/.test(v) || /^mailto:\S+@\S+$/.test(v),
    "Use a path like /register, an https:// link or a mailto: link"
  );

const price = (max: number) => z.coerce.number().min(0, "Can't be negative").max(max);

const slug = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only");

const featureKeys = FEATURES.map((f) => f.key) as [string, ...string[]];
const limitKeys = LIMITS.map((l) => l.key) as [string, ...string[]];

const benefitSchema = z
  .object({
    id: slug(40),
    label: required(120),
    // Set when the benefit is a feature the app enforces.
    feature: z.enum(featureKeys).nullable().default(null),
    // Set when the benefit shows a plan limit; the label then has "{n}".
    limit: z.enum(limitKeys).nullable().default(null),
    // A limit benefit's wording when the plan has no limit. Empty hides it.
    unlimitedLabel: text(120).default(""),
  })
  .refine((b) => !(b.feature && b.limit), { message: "A benefit can't be both a feature and a limit", path: ["limit"] });

const planSchema = z.object({
  id: slug(30),
  // Which plan in the app this card sells; null for a card that isn't one.
  planKey: z.enum(PLAN_KEYS).nullable().default(null),
  name: required(40),
  description: text(160),
  monthlyPrice: price(100_000),
  yearlyPrice: price(1_000_000),
  seatNote: text(160),
  // The ticked benefits. "features" is worked out from these and never sent.
  benefitIds: z.array(slug(40)).max(40).default([]),
  ctaLabel: required(40),
  ctaHref,
  // Plans saved before this switch existed have no value, which means shown.
  isVisible: z.boolean().default(true),
  highlighted: z.boolean(),
  badge: text(30),
});

export const pricingContentSchema = z
  .object({
    isVisible: z.boolean(),
    eyebrow: text(40),
    heading: required(120),
    subheading: text(300),
    currencySymbol: required(5),
    yearlyDiscountLabel: text(40),
    footnote: text(300),
    benefits: z.array(benefitSchema).max(40, "At most 40 benefits"),
    plans: z.array(planSchema).min(1, "Add at least one plan").max(4, "At most 4 plans"),
  })
  .refine((c) => new Set(c.plans.map((p) => p.id)).size === c.plans.length, {
    message: "Each plan needs its own ID",
    path: ["plans"],
  })
  .refine((c) => new Set(c.benefits.map((b) => b.id)).size === c.benefits.length, {
    message: "Each benefit needs its own ID",
    path: ["benefits"],
  })
  .refine(
    (c) => {
      const linked = c.benefits.filter((b) => b.feature).map((b) => b.feature);
      return new Set(linked).size === linked.length;
    },
    { message: "Each app feature can be linked to one benefit only", path: ["benefits"] }
  )
  .refine(
    (c) => {
      const linked = c.benefits.filter((b) => b.limit).map((b) => b.limit);
      return new Set(linked).size === linked.length;
    },
    { message: "Each plan limit can be linked to one benefit only", path: ["benefits"] }
  )
  .refine((c) => c.plans.every((p) => p.benefitIds.every((id) => c.benefits.some((b) => b.id === id))), {
    message: "A plan ticks a benefit that no longer exists",
    path: ["plans"],
  });

export const updatePricingSchema = z.object({ body: pricingContentSchema });

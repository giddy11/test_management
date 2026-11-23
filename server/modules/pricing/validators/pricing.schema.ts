// modules/pricing/validators/pricing.schema.ts
import { z } from "zod";

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

const planSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,30}$/, "Lowercase letters, numbers and dashes only"),
  name: required(40),
  description: text(160),
  monthlyPrice: price(100_000),
  yearlyPrice: price(1_000_000),
  seatNote: text(160),
  features: z.array(required(120)).max(15, "At most 15 features"),
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
    plans: z.array(planSchema).min(1, "Add at least one plan").max(4, "At most 4 plans"),
  })
  .refine((c) => new Set(c.plans.map((p) => p.id)).size === c.plans.length, {
    message: "Each plan needs its own ID",
    path: ["plans"],
  });

export const updatePricingSchema = z.object({ body: pricingContentSchema });

// modules/subscription/validators/subscription.schema.ts
import { z } from "zod";
import { FEATURES, LIMITS, PAYMENT_METHODS, PLAN_KEYS } from "../domain/planCatalog";

const orgIdParam = z.object({ organizationId: z.string().uuid() });

const featureSet = z.object(
  Object.fromEntries(FEATURES.map((f) => [f.key, z.boolean()])) as Record<string, z.ZodBoolean>
);
// null = unlimited.
const limitSet = z.object(
  Object.fromEntries(LIMITS.map((l) => [l.key, z.number().int().min(0).max(10_000_000).nullable()])) as Record<
    string,
    z.ZodNullable<z.ZodNumber>
  >
);
const planEntitlements = z.object({ features: featureSet, limits: limitSet });

export const updateEntitlementsSchema = z.object({
  body: z.object(
    Object.fromEntries(PLAN_KEYS.map((k) => [k, planEntitlements])) as Record<string, typeof planEntitlements>
  ),
});

export const organizationParamSchema = z.object({ params: orgIdParam });

export const setPlanSchema = z.object({
  params: orgIdParam,
  body: z
    .object({
      planKey: z.enum(PLAN_KEYS),
      status: z.enum(["active", "trial"]).default("active"),
      trialEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
      // Empty on an active paid plan = no end date (complimentary).
      paidUntil: z.string().datetime({ offset: true }).nullable().optional(),
      // Seats on top of the plan's own. Omitted = leave as they are.
      extraSeats: z.coerce.number().int().min(0).max(100_000).optional(),
      note: z.string().trim().max(500).nullable().optional(),
    })
    .refine((b) => b.planKey === "free" || b.status !== "trial" || !!b.trialEndsAt, {
      message: "A trial needs an end date",
      path: ["trialEndsAt"],
    })
    .refine((b) => !b.trialEndsAt || b.status !== "trial" || new Date(b.trialEndsAt).getTime() > Date.now(), {
      message: "The trial must end in the future",
      path: ["trialEndsAt"],
    }),
});

export const recordPaymentSchema = z.object({
  params: orgIdParam,
  body: z.object({
    planKey: z.enum(["standard", "enterprise"]),
    amount: z.coerce.number().positive("Enter the amount paid").max(1_000_000_000),
    // An ISO code: USD, NGN, GHS...
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code, like NGN or USD"),
    method: z.enum(PAYMENT_METHODS),
    reference: z.string().trim().max(120).nullable().optional(),
    paidAt: z.string().datetime({ offset: true }),
    // 0 = extra seats only, for the rest of the paid period already running.
    months: z.coerce.number().int().min(0).max(36),
    // The organisation's total extra seats from now on. Omitted = leave as they are.
    extraSeats: z.coerce.number().int().min(0).max(100_000).optional(),
    note: z.string().trim().max(500).nullable().optional(),
  }).refine((b) => b.months > 0 || b.extraSeats !== undefined, {
    message: "Say how many extra seats the organisation should have",
    path: ["extraSeats"],
  }),
});

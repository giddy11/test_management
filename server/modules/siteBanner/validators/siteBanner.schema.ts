// modules/siteBanner/validators/siteBanner.schema.ts
import { z } from "zod";

export const activateSiteBannerSchema = z.object({
  body: z
    .object({
      message: z.string().min(1).max(500),
      // 1 minute .. 7 days
      durationMinutes: z.coerce.number().int().min(1).max(10080),
      audience: z.enum(["all", "admins", "custom"]).default("all"),
      recipientIds: z.array(z.string().uuid()).max(500).optional(),
    })
    .refine((d) => d.audience !== "custom" || (d.recipientIds && d.recipientIds.length > 0), {
      message: "Select at least one user for a custom audience",
      path: ["recipientIds"],
    }),
});

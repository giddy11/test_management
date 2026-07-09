// modules/siteBanner/validators/siteBanner.schema.ts
import { z } from "zod";

export const activateSiteBannerSchema = z.object({
  body: z.object({
    message: z.string().min(1).max(500),
    // 1 minute .. 7 days
    durationMinutes: z.coerce.number().int().min(1).max(10080),
  }),
});

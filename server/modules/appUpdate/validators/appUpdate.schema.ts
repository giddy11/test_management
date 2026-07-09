// modules/appUpdate/validators/appUpdate.schema.ts
import { z } from "zod";

const appUpdateItemSchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    audience: z.enum(["all", "admins", "custom"]).default("admins"),
    recipientIds: z.array(z.string().uuid()).max(500).optional(),
  })
  .refine((d) => d.audience !== "custom" || (d.recipientIds && d.recipientIds.length > 0), {
    message: "Select at least one user for a custom audience",
    path: ["recipientIds"],
  });

export const createAppUpdateSchema = z.object({
  body: appUpdateItemSchema,
});

// Bulk-publish: a batch of announcements drafted together, e.g. everything
// shipped in a release, published in one action.
export const createBulkAppUpdateSchema = z.object({
  body: z.object({
    items: z.array(appUpdateItemSchema).min(1).max(30),
  }),
});

// Bulk-delete: select several published updates on the Announcements page and
// remove them in one action.
export const deleteBulkAppUpdateSchema = z.object({
  body: z.object({
    ids: z.array(z.string().uuid()).min(1).max(100),
  }),
});

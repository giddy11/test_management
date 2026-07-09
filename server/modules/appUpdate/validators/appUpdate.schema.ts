// modules/appUpdate/validators/appUpdate.schema.ts
import { z } from "zod";

export const createAppUpdateSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
  }),
});

// Bulk-publish: a batch of announcements drafted together, e.g. everything
// shipped in a release, published in one action.
export const createBulkAppUpdateSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          title: z.string().min(1).max(200),
          body: z.string().min(1).max(5000),
        })
      )
      .min(1)
      .max(30),
  }),
});

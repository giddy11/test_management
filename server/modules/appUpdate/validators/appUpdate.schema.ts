// modules/appUpdate/validators/appUpdate.schema.ts
import { z } from "zod";

export const createAppUpdateSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
  }),
});

// modules/reviewPrompt/validators/reviewPrompt.schema.ts
import { z } from "zod";

// "Every 2 hours or more", up to a week.
export const MIN_INTERVAL_HOURS = 2;
export const MAX_INTERVAL_HOURS = 168;

export const updateReviewPromptSettingsSchema = z.object({
  body: z.object({
    enabled: z.boolean(),
    intervalHours: z.number().int().min(MIN_INTERVAL_HOURS).max(MAX_INTERVAL_HOURS),
  }),
});

// The reporter's answer, shared by the bug and feature-request review routes.
// Saying "not fixed" needs a reason: it's what the team works from.
export const reviewAnswerSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      approved: z.boolean(),
      reason: z.string().trim().max(2000).optional(),
    })
    .refine((b) => b.approved || Boolean(b.reason), {
      message: "Say what is still wrong",
      path: ["reason"],
    }),
});

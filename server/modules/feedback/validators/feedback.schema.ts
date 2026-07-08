// modules/feedback/validators/feedback.schema.ts
import { z } from "zod";

const { enums } = require("../../../config/constants");

// constants.js exposes plain string arrays; zod's enum wants a tuple type.
const feedbackTypes = enums.feedbackType as [string, ...string[]];
const feedbackStatuses = enums.feedbackStatus as [string, ...string[]];

export const publicFormParamSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
});

export const submitFeedbackSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({
    type: z.enum(feedbackTypes),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(5000),
    suiteName: z.string().max(200).optional(),
    submitterName: z.string().min(1).max(120),
    submitterEmail: z.string().email().max(255),
  }),
});

export const fetchFeedbackSchema = z.object({
  query: z.object({
    projectId: z.string().uuid(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(feedbackStatuses).optional(),
    type: z.enum(feedbackTypes).optional(),
    search: z.string().optional(),
  }),
});

export const manageFeedbackSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      status: z.enum(feedbackStatuses).optional(),
      assignedToId: z.string().uuid().nullable().optional(),
      adminResponse: z.string().max(3000).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

export const feedbackLinkSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ enabled: z.boolean() }),
});

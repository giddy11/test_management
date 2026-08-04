// modules/liveChat/validators/liveChat.schema.ts
import { z } from "zod";
import { LiveChatStatus } from "../../../config/constants";

// ── Public (widget) ─────────────────────────────────────────────────────────

export const widgetTokenParamSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
});

// Same password policy as the main app's registerSchema (auth.schema.js) —
// lighter-weight account (no email verification), but the password itself
// shouldn't be any weaker.
const accountPasswordRule = z
  .string()
  .min(8)
  .max(64)
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[0-9]/, "Must contain a number");

export const registerAccountSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    password: accountPasswordRule,
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number").optional(),
    currentUrl: z.string().trim().max(2048).optional(),
    referrer: z.string().trim().max(2048).optional(),
  }),
});

export const loginAccountSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({
    email: z.string().trim().email().max(255),
    password: z.string().min(1),
    currentUrl: z.string().trim().max(2048).optional(),
    referrer: z.string().trim().max(2048).optional(),
  }),
});

// Called on widget mount. visitorId is omitted on a brand-new browser (the
// server issues one); sent back on every later call once the widget persists it.
export const startVisitorSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({
    visitorId: z.string().uuid().optional(),
    currentUrl: z.string().trim().max(2048).optional(),
    referrer: z.string().trim().max(2048).optional(),
  }),
});

// body is optional because a message can be image-only; the service enforces
// "text or attachment required" (same as support chat).
export const sendVisitorMessageSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({
    visitorId: z.string().uuid(),
    body: z.string().trim().max(5000).optional().default(""),
  }),
});

// POST, not GET — visitorId is the visitor's only credential, kept out of a
// query string / server log, same reasoning as the public feedback-comment routes.
export const fetchVisitorMessagesSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({
    visitorId: z.string().uuid(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  }),
});

export const markReadByVisitorSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({ visitorId: z.string().uuid() }),
});

// Same {token, visitorId} credential shape as markReadByVisitorSchema — kept
// as a separate export since it gates a semantically different action (the
// widget polls this to bootstrap/refresh its realtime listener).
export const getVisitorConversationSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({ visitorId: z.string().uuid() }),
});

// Backs the pre-chat contact form and any mid-conversation "leave your email".
export const updateContactSchema = z.object({
  params: z.object({ token: z.string().uuid() }),
  body: z.object({
    visitorId: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().max(255).optional(),
    // E.164 (e.g. "+2348012345678") — produced by the international phone input.
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid phone number").optional(),
  }),
});

// ── Staff (operator inbox) ──────────────────────────────────────────────────

export const fetchConversationsSchema = z.object({
  query: z.object({
    projectId: z.string().uuid(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum([LiveChatStatus.NEW, LiveChatStatus.IN_PROGRESS, LiveChatStatus.RESOLVED, LiveChatStatus.CLOSED])
      .optional(),
    assignedAgentId: z.string().uuid().optional(),
    unassigned: z.coerce.boolean().optional(),
  }),
});

export const conversationIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const fetchMessagesSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

export const sendAgentMessageSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    body: z.string().trim().max(5000).optional().default(""),
  }),
});

export const assignAgentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ agentId: z.string().uuid().nullable() }),
});

export const setStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum([LiveChatStatus.NEW, LiveChatStatus.IN_PROGRESS, LiveChatStatus.RESOLVED, LiveChatStatus.CLOSED]),
  }),
});

export const listVisitorsSchema = z.object({
  query: z.object({
    projectId: z.string().uuid(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
  }),
});

export const projectIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const updateSettingsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    displayName: z.string().trim().max(120).nullable().optional(),
    logoUrl: z.string().trim().max(2048).nullable().optional(),
    greetingMessage: z.string().trim().max(500).nullable().optional(),
    offlineMessage: z.string().trim().max(500).nullable().optional(),
    brandColor: z.string().trim().max(20).nullable().optional(),
    requireAccount: z.boolean().optional(),
  }),
});

// Enabling/rotating/disabling a project's widget link — mirrors feedbackLinkSchema.
export const liveChatLinkSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ enabled: z.boolean() }),
});

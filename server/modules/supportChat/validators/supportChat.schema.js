// modules/supportChat/validators/supportChat.schema.js
const { z } = require("zod");
const { SupportChatStatus } = require("../../../config/constants");

const setSettingsSchema = z.object({
  body: z.object({
    enabled: z.boolean(),
  }),
});

// body is optional because a message can be image-only; the service enforces
// "text or attachment required". Max is generous to allow long, formatted text.
const sendMessageSchema = z.object({
  body: z.object({
    body: z.string().trim().max(5000).optional().default(""),
  }),
});

const conversationMessageSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    body: z.string().trim().max(5000).optional().default(""),
  }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const listConversationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum([SupportChatStatus.OPEN, SupportChatStatus.CLOSED]).optional(),
  }),
});

const fetchMessagesSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

const setStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum([SupportChatStatus.OPEN, SupportChatStatus.CLOSED]),
  }),
});

module.exports = {
  setSettingsSchema,
  sendMessageSchema,
  conversationMessageSchema,
  idParamSchema,
  listConversationsSchema,
  fetchMessagesSchema,
  setStatusSchema,
};

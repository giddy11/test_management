// modules/liveChat/dto/liveChat.dto.ts
import type { LiveChatVisitor } from "../entities/liveChatVisitor.entity";
import type { LiveChatConversation } from "../entities/liveChatConversation.entity";
import type { LiveChatSettings } from "../entities/liveChatSettings.entity";
import type { LiveChatMessage } from "../repositories/liveChatMessage.repository";

export function toVisitorResponse(v: LiveChatVisitor | null) {
  if (!v) return null;
  return {
    id: v.id,
    name: v.name ?? null,
    email: v.email ?? null,
    phone: v.phone ?? null,
    currentUrl: v.currentUrl ?? null,
    referrer: v.referrer ?? null,
    firstSeenAt: v.firstSeenAt,
    lastSeenAt: v.lastSeenAt,
  };
}

export function toConversationResponse(c: LiveChatConversation | null) {
  if (!c) return null;
  const agent = c.assignedAgent as
    | { id: string; firstName: string; lastName: string | null; email: string }
    | undefined
    | null;
  return {
    id: c.id,
    projectId: c.projectId,
    visitor: toVisitorResponse((c.visitor as LiveChatVisitor) ?? null),
    status: c.status,
    assignedAgent: agent
      ? { id: agent.id, name: [agent.firstName, agent.lastName].filter(Boolean).join(" ") || agent.email }
      : null,
    lastMessageAt: c.lastMessageAt ?? null,
    lastMessagePreview: c.lastMessagePreview ?? null,
    lastSenderRole: c.lastSenderRole ?? null,
    visitorUnread: c.visitorUnread ?? 0,
    agentUnread: c.agentUnread ?? 0,
    createdAt: c.createdAt,
    closedAt: c.closedAt ?? null,
  };
}

// Firestore has no join — authorId/authorName/authorRole are denormalized onto the doc.
export function toMessageResponse(m: LiveChatMessage | null) {
  if (!m) return null;
  return {
    id: m.id,
    conversationId: m.conversationId,
    author: m.authorId ? { id: m.authorId, name: m.authorName || "Deleted user" } : null,
    authorName: m.authorName ?? null,
    authorRole: m.authorRole ?? null,
    body: m.body,
    attachments: (m.attachments ?? []).map((a) => ({
      url: a.url,
      name: a.name ?? null,
      mimeType: a.mimeType ?? null,
      bytes: a.bytes ?? null,
    })),
    createdAt: m.createdAt,
  };
}

export function toSettingsResponse(s: LiveChatSettings | null) {
  if (!s) return null;
  return {
    projectId: s.projectId,
    displayName: s.displayName ?? null,
    logoUrl: s.logoUrl ?? null,
    greetingMessage: s.greetingMessage ?? null,
    offlineMessage: s.offlineMessage ?? null,
    brandColor: s.brandColor ?? null,
    requireAccount: s.requireAccount,
    updatedAt: s.updatedAt,
  };
}

// types/liveChat.types.ts — shared by the embeddable widget (visitor-facing)
// and the operator inbox (staff-facing) — both talk to the same conversation/
// message shapes, just through different endpoints.

export interface LiveChatWidgetConfig {
  projectId: string
  displayName: string
  logoUrl: string | null
  greetingMessage: string
  offlineMessage: string
  brandColor: string | null
}

export interface LiveChatVisitor {
  id: string
  name: string | null
  email: string | null
  currentUrl: string | null
  referrer: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export type LiveChatStatus = "open" | "closed"
export type LiveChatSenderRole = "visitor" | "agent" | "bot"

export interface LiveChatConversation {
  id: string
  projectId: string
  visitor: LiveChatVisitor | null
  status: LiveChatStatus
  assignedAgent: { id: string; name: string } | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastSenderRole: LiveChatSenderRole | null
  visitorUnread: number
  agentUnread: number
  createdAt: string
  closedAt: string | null
}

export interface LiveChatAttachment {
  url: string
  name: string | null
  mimeType: string | null
  bytes: number | null
}

export interface LiveChatMessage {
  id: string
  conversationId: string
  author: { id: string; name: string } | null
  authorName: string | null
  authorRole: LiveChatSenderRole | null
  body: string
  attachments: LiveChatAttachment[]
  createdAt: string
}

// Per-project widget presentation config — the operator inbox's settings panel.
export interface LiveChatSettings {
  projectId: string
  displayName: string | null
  logoUrl: string | null
  greetingMessage: string | null
  offlineMessage: string | null
  brandColor: string | null
  updatedAt: string
}

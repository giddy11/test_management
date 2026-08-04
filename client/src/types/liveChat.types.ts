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
  // When true, the widget gates on a real login/signup (LiveChatAccount)
  // instead of the free-form pre-chat contact form.
  requireAccount: boolean
}

export interface LiveChatVisitor {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  currentUrl: string | null
  referrer: string | null
  firstSeenAt: string
  lastSeenAt: string
}

// Shown to the visitor so they know where their request stands — see the
// matching comment on the server's LiveChatStatus. NEW/IN_PROGRESS are
// system-driven; RESOLVED/CLOSED are staff-set.
export type LiveChatStatus = "new" | "in_progress" | "resolved" | "closed"
export type LiveChatSenderRole = "visitor" | "agent" | "bot"

export const LIVE_CHAT_STATUSES: LiveChatStatus[] = ["new", "in_progress", "resolved", "closed"]

export const LIVE_CHAT_STATUS_LABELS: Record<LiveChatStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
}

// Shared by the widget and the operator inbox — deliberately gentle (not
// alarming) since the widget shows this straight to the visitor; unread
// counts already carry the "needs attention" signal on the staff side.
export const LIVE_CHAT_STATUS_VARIANT: Record<LiveChatStatus, "default" | "secondary" | "outline"> = {
  new: "secondary",
  in_progress: "default",
  resolved: "default",
  closed: "outline",
}

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
  requireAccount: boolean
  updatedAt: string
}

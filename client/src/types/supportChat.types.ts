// types/supportChat.types.ts

export interface SupportChatSettings {
  enabled: boolean
}

export type SupportChatStatus = "open" | "closed"
export type SupportChatSenderRole = "user" | "admin"

export interface SupportChatConversation {
  id: string
  user: { id: string; name: string; email: string } | null
  status: SupportChatStatus
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastSenderRole: SupportChatSenderRole | null
  userUnread: number
  adminUnread: number
  createdAt: string
}

export interface SupportChatAttachment {
  url: string
  name: string | null
  mimeType: string | null
  bytes: number | null
}

export interface SupportChatMessage {
  id: string
  conversationId: string
  author: { id: string; name: string } | null
  authorRole: SupportChatSenderRole | null
  body: string
  attachments: SupportChatAttachment[]
  createdAt: string
}

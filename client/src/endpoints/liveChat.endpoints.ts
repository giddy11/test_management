// endpoints/liveChat.endpoints.ts
// LiveChatWidgetEndpoints: the embeddable widget's own calls (unauthenticated,
// token-gated). LiveChatAdminEndpoints: the operator inbox (authenticated,
// project-scoped) — same split as supportChat.endpoints.ts's two exports.
import { wrapCall, uploadFilesWithFields } from "@/transport/http"
import type {
  LiveChatWidgetConfig,
  LiveChatVisitor,
  LiveChatConversation,
  LiveChatMessage,
  LiveChatSettings,
  LiveChatStatus,
} from "@/types/liveChat.types"
import type { WhatsAppTicketPayload, WhatsAppTicketResult } from "@/types/feedback.types"

const obj = (p: unknown) => p as Record<string, unknown>

export const LiveChatWidgetEndpoints = {
  getConfig: (token: string) => wrapCall<LiveChatWidgetConfig>("GET", `/api/v1/public/live-chat/${token}`),

  // The WhatsApp embed widget, just before its wa.me hand-off.
  createWhatsAppTicket: (token: string, payload: WhatsAppTicketPayload) =>
    wrapCall<WhatsAppTicketResult>("POST", `/api/v1/public/live-chat/${token}/whatsapp-ticket`, obj(payload)),

  startVisitor: (
    token: string,
    data: { visitorId?: string; currentUrl?: string; referrer?: string }
  ) => wrapCall<LiveChatVisitor>("POST", `/api/v1/public/live-chat/${token}/visitors`, data),

  // Account sign-in — the opt-in alternative to startVisitor above (see
  // LiveChatWidgetConfig.requireAccount). Both resolve to the same visitor
  // shape, so everything downstream (messaging, read receipts) is identical
  // regardless of which front door was used.
  register: (
    token: string,
    data: { name: string; email: string; password: string; phone?: string; currentUrl?: string; referrer?: string }
  ) => wrapCall<LiveChatVisitor>("POST", `/api/v1/public/live-chat/${token}/auth/register`, data),

  login: (
    token: string,
    data: { email: string; password: string; currentUrl?: string; referrer?: string }
  ) => wrapCall<LiveChatVisitor>("POST", `/api/v1/public/live-chat/${token}/auth/login`, data),

  getConversation: (token: string, visitorId: string) =>
    wrapCall<LiveChatConversation | null>("POST", `/api/v1/public/live-chat/${token}/conversation`, {
      visitorId,
    }),

  // Image attachments go up as multipart (field "images"); a text-only message
  // stays a plain JSON POST — same convention as support chat.
  sendMessage: (token: string, visitorId: string, body: string, files: File[] = []) =>
    files.length
      ? uploadFilesWithFields<LiveChatMessage>(
          `/api/v1/public/live-chat/${token}/messages`,
          files,
          { visitorId, body },
          "images"
        )
      : wrapCall<LiveChatMessage>("POST", `/api/v1/public/live-chat/${token}/messages`, {
          visitorId,
          body,
        }),

  markRead: (token: string, visitorId: string) =>
    wrapCall<null>("POST", `/api/v1/public/live-chat/${token}/read`, { visitorId }),

  updateContact: (token: string, visitorId: string, data: { name?: string; email?: string; phone?: string }) =>
    wrapCall<LiveChatVisitor>("POST", `/api/v1/public/live-chat/${token}/contact`, {
      visitorId,
      ...data,
    }),
}

// The operator inbox — staff-facing, authenticated, project-scoped.
export const LiveChatAdminEndpoints = {
  listConversations: (params: {
    projectId: string
    page?: number
    limit?: number
    status?: LiveChatStatus
    assignedAgentId?: string
    unassigned?: boolean
  }) => wrapCall<LiveChatConversation[]>("GET", "/api/v1/live-chat/conversations", obj(params)),

  fetchMessages: (id: string, params: { page?: number; limit?: number } = {}) =>
    wrapCall<LiveChatMessage[]>("GET", `/api/v1/live-chat/conversations/${id}/messages`, obj(params)),

  // Image attachments go up as multipart (field "images"); a text-only message
  // stays a plain JSON POST — same convention as support chat.
  sendMessage: (id: string, body: string, files: File[] = []) =>
    files.length
      ? uploadFilesWithFields<LiveChatMessage>(
          `/api/v1/live-chat/conversations/${id}/messages`,
          files,
          { body },
          "images"
        )
      : wrapCall<LiveChatMessage>("POST", `/api/v1/live-chat/conversations/${id}/messages`, { body }),

  markRead: (id: string) => wrapCall<null>("POST", `/api/v1/live-chat/conversations/${id}/read`),

  assignAgent: (id: string, agentId: string | null) =>
    wrapCall<LiveChatConversation>("PATCH", `/api/v1/live-chat/conversations/${id}/assign`, { agentId }),

  setStatus: (id: string, status: LiveChatStatus) =>
    wrapCall<LiveChatConversation>("PATCH", `/api/v1/live-chat/conversations/${id}`, { status }),

  listVisitors: (params: { projectId: string; page?: number; limit?: number; search?: string }) =>
    wrapCall<LiveChatVisitor[]>("GET", "/api/v1/live-chat/visitors", obj(params)),

  getSettings: (projectId: string) =>
    wrapCall<LiveChatSettings>("GET", `/api/v1/live-chat/projects/${projectId}/settings`),

  updateSettings: (
    projectId: string,
    patch: Partial<
      Pick<
        LiveChatSettings,
        "displayName" | "logoUrl" | "greetingMessage" | "offlineMessage" | "brandColor" | "requireAccount"
      >
    >
  ) => wrapCall<LiveChatSettings>("PATCH", `/api/v1/live-chat/projects/${projectId}/settings`, obj(patch)),

  setLink: (projectId: string, enabled: boolean) =>
    wrapCall<{ liveChatToken: string | null }>("POST", `/api/v1/live-chat/projects/${projectId}/link`, {
      enabled,
    }),
}

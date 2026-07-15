// endpoints/supportChat.endpoints.ts
import { wrapCall, uploadFilesWithFields } from "@/transport/http"
import type {
  SupportChatConversation,
  SupportChatMessage,
  SupportChatSettings,
  SupportChatStatus,
} from "@/types/supportChat.types"

const obj = (p: unknown) => p as Record<string, unknown>

// User side — the floating widget.
export const SupportChatEndpoints = {
  getSettings: () => wrapCall<SupportChatSettings>("GET", "/api/v1/support-chat/settings"),
  myConversation: () =>
    wrapCall<SupportChatConversation>("GET", "/api/v1/support-chat/me/conversation"),
  // Image attachments go up as multipart (field "images"); a text-only message
  // stays a plain JSON POST.
  sendMyMessage: (body: string, files: File[] = []) =>
    files.length
      ? uploadFilesWithFields<SupportChatMessage>(
          "/api/v1/support-chat/me/messages",
          files,
          { body },
          "images"
        )
      : wrapCall<SupportChatMessage>("POST", "/api/v1/support-chat/me/messages", { body }),
  markMyRead: () => wrapCall<null>("POST", "/api/v1/support-chat/me/read"),
}

// Super-admin side — the inbox.
export const SupportChatAdminEndpoints = {
  setEnabled: (enabled: boolean) =>
    wrapCall<SupportChatSettings>("PATCH", "/api/v1/support-chat/settings", { enabled }),
  listConversations: (params: { page?: number; limit?: number; status?: SupportChatStatus } = {}) =>
    wrapCall<SupportChatConversation[]>("GET", "/api/v1/support-chat/conversations", obj(params)),
  fetchMessages: (id: string, params: { page?: number; limit?: number } = {}) =>
    wrapCall<SupportChatMessage[]>(
      "GET",
      `/api/v1/support-chat/conversations/${id}/messages`,
      obj(params)
    ),
  sendMessage: (id: string, body: string, files: File[] = []) =>
    files.length
      ? uploadFilesWithFields<SupportChatMessage>(
          `/api/v1/support-chat/conversations/${id}/messages`,
          files,
          { body },
          "images"
        )
      : wrapCall<SupportChatMessage>("POST", `/api/v1/support-chat/conversations/${id}/messages`, {
          body,
        }),
  markRead: (id: string) =>
    wrapCall<null>("POST", `/api/v1/support-chat/conversations/${id}/read`),
  setStatus: (id: string, status: SupportChatStatus) =>
    wrapCall<SupportChatConversation>("PATCH", `/api/v1/support-chat/conversations/${id}`, {
      status,
    }),
}

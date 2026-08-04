// hooks/useLiveChatInbox.ts — the operator inbox's data layer (staff-facing,
// authenticated, project-scoped). The realtime message stream itself is
// shared with the widget — see useLiveChatMessages in useLiveChatWidget.ts,
// it's just a Firestore listener keyed by conversationId with no
// visitor/staff distinction.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { LiveChatAdminEndpoints } from "@/endpoints/liveChat.endpoints"
import { ApiError } from "@/transport/http"
import type { LiveChatConversation, LiveChatSettings, LiveChatStatus } from "@/types/liveChat.types"

export const LIVE_CHAT_INBOX_KEY = "liveChatInbox"

export function useLiveChatConversations(projectId: string, status?: LiveChatStatus) {
  return useQuery({
    queryKey: [LIVE_CHAT_INBOX_KEY, "conversations", projectId, status ?? "all"],
    queryFn: async () => {
      const res = await LiveChatAdminEndpoints.listConversations({ projectId, limit: 50, status })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return (res.data ?? []) as LiveChatConversation[]
    },
    enabled: Boolean(projectId),
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  })
}

export function useSendLiveChatAgentMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body, files }: { id: string; body: string; files?: File[] }) => {
      const res = await LiveChatAdminEndpoints.sendMessage(id, body, files ?? [])
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LIVE_CHAT_INBOX_KEY, "conversations"] }),
  })
}

export function useMarkLiveChatAgentRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await LiveChatAdminEndpoints.markRead(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LIVE_CHAT_INBOX_KEY, "conversations"] }),
  })
}

export function useAssignLiveChatAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, agentId }: { id: string; agentId: string | null }) => {
      const res = await LiveChatAdminEndpoints.assignAgent(id, agentId)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LIVE_CHAT_INBOX_KEY, "conversations"] }),
  })
}

export function useSetLiveChatConversationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LiveChatStatus }) => {
      const res = await LiveChatAdminEndpoints.setStatus(id, status)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LIVE_CHAT_INBOX_KEY, "conversations"] }),
  })
}

// ── Per-project widget settings ─────────────────────────────────────────────

export function useLiveChatSettings(projectId: string) {
  return useQuery({
    queryKey: [LIVE_CHAT_INBOX_KEY, "settings", projectId],
    queryFn: async () => {
      const res = await LiveChatAdminEndpoints.getSettings(projectId)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(projectId),
  })
}

export function useUpdateLiveChatSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      projectId,
      ...patch
    }: { projectId: string } & Partial<
      Pick<
        LiveChatSettings,
        "displayName" | "logoUrl" | "greetingMessage" | "offlineMessage" | "brandColor" | "requireAccount"
      >
    >) => {
      const res = await LiveChatAdminEndpoints.updateSettings(projectId, patch)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: (_data, { projectId }) =>
      qc.invalidateQueries({ queryKey: [LIVE_CHAT_INBOX_KEY, "settings", projectId] }),
  })
}

// The token lives on the project detail — refresh it, same as useSetFeedbackLink.
export function useSetLiveChatLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, enabled }: { projectId: string; enabled: boolean }) => {
      const res = await LiveChatAdminEndpoints.setLink(projectId, enabled)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  })
}

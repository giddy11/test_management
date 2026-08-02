// hooks/useLiveChatWidget.ts — the embeddable widget's own data layer
// (visitor-facing, unauthenticated). Mirrors useSupportChat.ts's shape.
import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore"
import { db, ensureFirebaseAuth } from "@/lib/firestore"
import { LiveChatWidgetEndpoints } from "@/endpoints/liveChat.endpoints"
import { ApiError } from "@/transport/http"
import type { LiveChatConversation, LiveChatMessage, LiveChatVisitor } from "@/types/liveChat.types"

export const LIVE_CHAT_KEY = "liveChatWidget"

function visitorStorageKey(token: string): string {
  return `tm_live_chat_visitor_${token}`
}

// ── Widget config (branding) ────────────────────────────────────────────────

export function useLiveChatWidgetConfig(token: string | undefined) {
  return useQuery({
    queryKey: [LIVE_CHAT_KEY, token, "config"],
    queryFn: async () => {
      const res = await LiveChatWidgetEndpoints.getConfig(token as string)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(token),
    staleTime: 60000,
    retry: false,
  })
}

// ── Visitor session ──────────────────────────────────────────────────────────
// Bootstraps once per token: reuses the id persisted from a prior visit (so
// conversation history survives a page reload/return visit), or lets the
// server issue a new one — same idea as a session token, just anonymous.
export function useLiveChatVisitor(token: string | undefined) {
  return useQuery({
    queryKey: [LIVE_CHAT_KEY, token, "visitor"],
    queryFn: async () => {
      const key = visitorStorageKey(token as string)
      const existingId = localStorage.getItem(key) ?? undefined
      const res = await LiveChatWidgetEndpoints.startVisitor(token as string, {
        visitorId: existingId,
        currentUrl: window.location.href,
        referrer: document.referrer || undefined,
      })
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      localStorage.setItem(key, res.data.id)
      return res.data
    },
    enabled: Boolean(token),
    staleTime: Infinity,
    retry: false,
  })
}

// ── Conversation (polled so the unread badge stays live while the panel is closed) ──
export function useLiveChatConversation(token: string | undefined, visitorId: string | undefined) {
  return useQuery({
    queryKey: [LIVE_CHAT_KEY, token, "conversation", visitorId],
    queryFn: async () => {
      const res = await LiveChatWidgetEndpoints.getConversation(token as string, visitorId as string)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return (res.data ?? null) as LiveChatConversation | null
    },
    enabled: Boolean(token) && Boolean(visitorId),
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  })
}

// ── Realtime message stream ──────────────────────────────────────────────────
// The server (Admin SDK) is the only writer; this just listens — same pattern
// as useSupportChatMessages, different collection.
function toMessage(doc: QueryDocumentSnapshot<DocumentData>): LiveChatMessage {
  const data = doc.data()
  return {
    id: doc.id,
    conversationId: data.conversationId,
    author: data.authorId ? { id: data.authorId, name: data.authorName || "Deleted user" } : null,
    authorName: data.authorName ?? null,
    authorRole: data.authorRole ?? null,
    body: data.body ?? "",
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
  }
}

export function useLiveChatMessages(conversationId: string | undefined) {
  const [data, setData] = useState<LiveChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!conversationId) {
      setData([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    ensureFirebaseAuth()
      .then(() => {
        if (cancelled) return
        const q = query(
          collection(db, "liveChatMessages"),
          where("conversationId", "==", conversationId),
          where("deletedAt", "==", null),
          orderBy("createdAt", "asc")
        )
        unsubscribe = onSnapshot(
          q,
          (snap) => {
            setData(snap.docs.map(toMessage))
            setIsLoading(false)
          },
          () => setIsLoading(false)
        )
      })
      .catch(() => setIsLoading(false))

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [conversationId])

  return { data, isLoading }
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useSendLiveChatMessage(token: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ visitorId, body, files }: { visitorId: string; body: string; files?: File[] }) => {
      const res = await LiveChatWidgetEndpoints.sendMessage(token as string, visitorId, body, files ?? [])
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    // The thread updates itself via the realtime listener — just refresh the
    // conversation row (it may have just been created lazily on first send).
    onSuccess: () => qc.invalidateQueries({ queryKey: [LIVE_CHAT_KEY, token, "conversation"] }),
  })
}

export function useMarkLiveChatRead(token: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (visitorId: string) => {
      const res = await LiveChatWidgetEndpoints.markRead(token as string, visitorId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [LIVE_CHAT_KEY, token, "conversation"] }),
  })
}

export function useUpdateLiveChatContact(token: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ visitorId, ...data }: { visitorId: string; name?: string; email?: string }) => {
      const res = await LiveChatWidgetEndpoints.updateContact(token as string, visitorId, data)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: (visitor: LiveChatVisitor) => {
      qc.setQueryData([LIVE_CHAT_KEY, token, "visitor"], visitor)
    },
  })
}

import { useEffect, useRef, useState } from "react"
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
import { SupportChatEndpoints, SupportChatAdminEndpoints } from "@/endpoints/supportChat.endpoints"
import { ApiError } from "@/transport/http"
import { useAuth } from "@/contexts/AuthContext"
import { playNotificationSound } from "@/lib/notificationSound"
import type {
  SupportChatConversation,
  SupportChatMessage,
  SupportChatStatus,
} from "@/types/supportChat.types"

export const SUPPORT_CHAT_KEY = "supportChat"

function toMessage(doc: QueryDocumentSnapshot<DocumentData>): SupportChatMessage {
  const data = doc.data()
  return {
    id: doc.id,
    conversationId: data.conversationId,
    author: data.authorId ? { id: data.authorId, name: data.authorName || "Deleted user" } : null,
    authorRole: data.authorRole ?? null,
    body: data.body ?? "",
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
  }
}

// Realtime message stream for a conversation — the server (Admin SDK) is the only
// writer; this just listens. Shared by the user floater and the admin inbox.
export function useSupportChatMessages(conversationId: string | undefined) {
  const [data, setData] = useState<SupportChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)

  // Read via a ref inside the snapshot callback so a user/setting change
  // doesn't force the Firestore listener to resubscribe.
  const { user } = useAuth()
  const userRef = useRef(user)
  userRef.current = user

  useEffect(() => {
    let firstSnapshot = true
    let lastSeenId: string | null = null

    if (!conversationId) {
      setData([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setIsError(false)
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    ensureFirebaseAuth()
      .then(() => {
        if (cancelled) return
        const q = query(
          collection(db, "supportChatMessages"),
          where("conversationId", "==", conversationId),
          where("deletedAt", "==", null),
          orderBy("createdAt", "asc")
        )
        unsubscribe = onSnapshot(
          q,
          (snap) => {
            const next = snap.docs.map(toMessage)
            setData(next)
            setIsLoading(false)

            // Chime on a genuinely new incoming message — skip the initial
            // load of a thread's history and messages the viewer sent themselves.
            const latest = next[next.length - 1]
            if (!firstSnapshot && latest && latest.id !== lastSeenId) {
              const currentUser = userRef.current
              const isMine = latest.author?.id === currentUser?.id
              if (!isMine && currentUser?.notificationSoundEnabled !== false) {
                playNotificationSound()
              }
            }
            firstSnapshot = false
            lastSeenId = latest ? latest.id : null
          },
          () => {
            setIsError(true)
            setIsLoading(false)
          }
        )
      })
      .catch(() => {
        setIsError(true)
        setIsLoading(false)
      })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [conversationId])

  return { data, isLoading, isError }
}

// ── Global on/off toggle ────────────────────────────────────────────────────

// Whether the floater is enabled platform-wide. Read by the widget (to decide
// whether to render) and by the super admin's inbox (to show the toggle state).
export function useSupportChatSettings(enabled = true) {
  return useQuery({
    queryKey: [SUPPORT_CHAT_KEY, "settings"],
    queryFn: async () => {
      const res = await SupportChatEndpoints.getSettings()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled,
    staleTime: 60000,
  })
}

export function useSetSupportChatEnabled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (value: boolean) => {
      const res = await SupportChatAdminEndpoints.setEnabled(value)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [SUPPORT_CHAT_KEY, "settings"] }),
  })
}

// ── User side (the floater) ────────────────────────────────────────────────

// Get-or-create the user's open conversation. Polled so the unread badge stays
// live even while the panel is closed (the thread itself is realtime once open).
export function useMyConversation(enabled = true) {
  return useQuery({
    queryKey: [SUPPORT_CHAT_KEY, "me"],
    queryFn: async () => {
      const res = await SupportChatEndpoints.myConversation()
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      // null until the user sends their first message (created lazily server-side).
      return (res.data ?? null) as SupportChatConversation | null
    },
    enabled,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  })
}

export function useSendMyMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, files }: { body: string; files?: File[] }) => {
      const res = await SupportChatEndpoints.sendMyMessage(body, files ?? [])
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    // The thread updates itself via the realtime listener — just refresh the
    // conversation row (in case it was created lazily on first send).
    onSuccess: () => qc.invalidateQueries({ queryKey: [SUPPORT_CHAT_KEY, "me"] }),
  })
}

export function useMarkMyRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await SupportChatEndpoints.markMyRead()
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [SUPPORT_CHAT_KEY, "me"] }),
  })
}

// ── Super-admin side (the inbox) ────────────────────────────────────────────

export function useSupportChatConversations(status?: SupportChatStatus) {
  return useQuery({
    queryKey: [SUPPORT_CHAT_KEY, "conversations", status ?? "all"],
    queryFn: async () => {
      const res = await SupportChatAdminEndpoints.listConversations({ limit: 50, status })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return (res.data ?? []) as SupportChatConversation[]
    },
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  })
}

export function useSendAdminMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body, files }: { id: string; body: string; files?: File[] }) => {
      const res = await SupportChatAdminEndpoints.sendMessage(id, body, files ?? [])
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [SUPPORT_CHAT_KEY, "conversations"] }),
  })
}

export function useMarkAdminRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await SupportChatAdminEndpoints.markRead(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [SUPPORT_CHAT_KEY, "conversations"] }),
  })
}

export function useSetConversationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SupportChatStatus }) => {
      const res = await SupportChatAdminEndpoints.setStatus(id, status)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [SUPPORT_CHAT_KEY, "conversations"] }),
  })
}

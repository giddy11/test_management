import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import { FeatureRequestCommentEndpoints } from "@/endpoints/featureRequest.endpoints"
import { ApiError } from "@/transport/http"
import { FEATURE_REQUESTS_KEY } from "@/hooks/useFeatureRequests"
import { useAuth } from "@/contexts/AuthContext"
import { summarizeReactions } from "@/lib/commentThreads"
import type { FeatureRequestComment } from "@/types/featureRequest.types"

function toComment(
  doc: QueryDocumentSnapshot<DocumentData>,
  viewerId: string | undefined
): FeatureRequestComment {
  const data = doc.data()
  return {
    id: doc.id,
    featureRequestId: data.featureRequestId,
    parentId: data.parentId ?? null,
    author: data.authorId ? { id: data.authorId, name: data.authorName || "Deleted user" } : null,
    body: data.body,
    editedAt: data.editedAt ? data.editedAt.toDate().toISOString() : null,
    reactions: summarizeReactions(data.reactions, viewerId),
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
  }
}

// Realtime — the server (Admin SDK) is the only writer; this just listens.
export function useFeatureRequestComments(requestId: string) {
  const { user } = useAuth()
  const [data, setData] = useState<FeatureRequestComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!requestId) return
    setIsLoading(true)
    setIsError(false)
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    ensureFirebaseAuth()
      .then(() => {
        if (cancelled) return
        const q = query(
          collection(db, "featureRequestComments"),
          where("featureRequestId", "==", requestId),
          where("deletedAt", "==", null),
          orderBy("createdAt", "asc")
        )
        unsubscribe = onSnapshot(
          q,
          (snap) => {
            setData(snap.docs.map((d) => toComment(d, user?.id)))
            setIsLoading(false)
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
  }, [requestId, user?.id])

  return { data, isLoading, isError }
}

export function useAddFeatureRequestComment(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId?: string }) => {
      const res = await FeatureRequestCommentEndpoints.create(requestId, body, parentId)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    // The comment list updates on its own via the realtime listener — only the
    // card's denormalized commentCount needs a refetch.
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEATURE_REQUESTS_KEY] }),
  })
}

export function useEditFeatureRequestComment(requestId: string) {
  return useMutation({
    mutationFn: async ({ commentId, body }: { commentId: string; body: string }) => {
      const res = await FeatureRequestCommentEndpoints.edit(requestId, commentId, body)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
  })
}

export function useDeleteFeatureRequestComment(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string) => {
      const res = await FeatureRequestCommentEndpoints.remove(requestId, commentId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEATURE_REQUESTS_KEY] }),
  })
}

export function useSetFeatureRequestCommentReaction(requestId: string) {
  return useMutation({
    mutationFn: async ({
      commentId,
      reaction,
    }: {
      commentId: string
      reaction: "like" | "dislike" | null
    }) => {
      const res = await FeatureRequestCommentEndpoints.setReaction(requestId, commentId, reaction)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
  })
}

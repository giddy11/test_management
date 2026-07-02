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
import type { FeatureRequestComment } from "@/types/featureRequest.types"

function toComment(doc: QueryDocumentSnapshot<DocumentData>): FeatureRequestComment {
  const data = doc.data()
  return {
    id: doc.id,
    featureRequestId: data.featureRequestId,
    author: data.authorId ? { id: data.authorId, name: data.authorName || "Deleted user" } : null,
    body: data.body,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
  }
}

// Realtime — the server (Admin SDK) is the only writer; this just listens.
export function useFeatureRequestComments(requestId: string) {
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
            setData(snap.docs.map(toComment))
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
  }, [requestId])

  return { data, isLoading, isError }
}

export function useAddFeatureRequestComment(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await FeatureRequestCommentEndpoints.create(requestId, body)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    // The comment list updates on its own via the realtime listener — only the
    // card's denormalized commentCount needs a refetch.
    onSuccess: () => qc.invalidateQueries({ queryKey: [FEATURE_REQUESTS_KEY] }),
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

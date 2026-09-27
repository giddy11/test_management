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
import { BugCommentEndpoints } from "@/endpoints/bug.endpoints"
import { ApiError } from "@/transport/http"
import { BUGS_KEY } from "@/hooks/useBugs"
import type { BugComment } from "@/types/bug.types"

function toComment(doc: QueryDocumentSnapshot<DocumentData>): BugComment {
  const data = doc.data()
  return {
    id: doc.id,
    bugId: data.bugId,
    author: data.authorId ? { id: data.authorId, name: data.authorName || "Deleted user" } : null,
    body: data.body,
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
  }
}

// Realtime — the server (Admin SDK) is the only writer; this just listens.
export function useBugComments(bugId: string) {
  const [data, setData] = useState<BugComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!bugId) return
    setIsLoading(true)
    setIsError(false)
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    ensureFirebaseAuth()
      .then(() => {
        if (cancelled) return
        const q = query(
          collection(db, "bugComments"),
          where("bugId", "==", bugId),
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
  }, [bugId])

  return { data, isLoading, isError }
}

export function useAddBugComment(bugId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await BugCommentEndpoints.create(bugId, body)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    // The comment list updates on its own via the realtime listener — only the
    // card's denormalized commentCount needs a refetch.
    onSuccess: () => qc.invalidateQueries({ queryKey: [BUGS_KEY] }),
  })
}

export function useDeleteBugComment(bugId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string) => {
      const res = await BugCommentEndpoints.remove(bugId, commentId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BUGS_KEY] }),
  })
}

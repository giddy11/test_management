// hooks/useFeedbackComments.ts — realtime read side of a ticket's comment
// thread. Same pattern as useFeatureRequestComments.ts, but shared by staff
// (internal dialogs) AND the public ticket submitter alike: Firestore's rules
// for this collection only require "signed in, even anonymously" (see
// firestore.rules) — the server independently re-verifies write access (and,
// for the submitter, their email+code) before ever writing to a thread.
import { useEffect, useState } from "react"
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
import type { FeedbackComment } from "@/types/feedback.types"

function toComment(doc: QueryDocumentSnapshot<DocumentData>): FeedbackComment {
  const data = doc.data()
  return {
    id: doc.id,
    feedbackId: data.feedbackId,
    authorType: data.authorType,
    authorId: data.authorId ?? null,
    authorName: data.authorName || "Deleted user",
    body: data.body,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
  }
}

// Realtime — the server (Admin SDK) is the only writer; this just listens.
export function useFeedbackCommentThread(feedbackId: string) {
  const [data, setData] = useState<FeedbackComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!feedbackId) return
    setIsLoading(true)
    setIsError(false)
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    ensureFirebaseAuth()
      .then(() => {
        if (cancelled) return
        const q = query(
          collection(db, "feedbackComments"),
          where("feedbackId", "==", feedbackId),
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
  }, [feedbackId])

  return { data, isLoading, isError }
}

// Groups a flat, realtime comment list into root comments + their replies.
// Threading is deliberately flat (one level) — replying to a reply threads
// under that reply's own root (see each service's addComment/resolveParentId),
// so there's never a third level to render here.
export interface ThreadableComment {
  id: string
  parentId: string | null
}

export interface CommentMention {
  id: string
  name: string
}

export interface CommentReactionSummary {
  likeCount: number
  dislikeCount: number
  myReaction: "like" | "dislike" | null
}

// Reduces a comment's raw Firestore reactions map (userId -> "like"|"dislike")
// into counts + the current viewer's own reaction. Mirrors the server's
// toCommentResponse so the realtime (Firestore) and REST (post/edit) paths
// compute the same shape.
export function summarizeReactions(
  reactions: Record<string, string> | undefined,
  viewerId: string | undefined
): CommentReactionSummary {
  let likeCount = 0
  let dislikeCount = 0
  let myReaction: "like" | "dislike" | null = null
  for (const [userId, r] of Object.entries(reactions ?? {})) {
    if (r === "like") likeCount++
    else if (r === "dislike") dislikeCount++
    if (userId === viewerId) myReaction = r as "like" | "dislike"
  }
  return { likeCount, dislikeCount, myReaction }
}

export interface CommentThreadGroup<T extends ThreadableComment> {
  root: T
  replies: T[]
}

export function groupIntoThreads<T extends ThreadableComment>(comments: T[]): CommentThreadGroup<T>[] {
  const repliesByParent = new Map<string, T[]>()
  for (const c of comments) {
    if (!c.parentId) continue
    const list = repliesByParent.get(c.parentId)
    if (list) list.push(c)
    else repliesByParent.set(c.parentId, [c])
  }
  return comments
    .filter((c) => !c.parentId)
    .map((root) => ({ root, replies: repliesByParent.get(root.id) ?? [] }))
}

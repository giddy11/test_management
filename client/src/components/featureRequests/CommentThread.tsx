import { useEffect, useRef, useState } from "react"
import { Pencil, Reply, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { InlineLoader } from "@/components/shared/PageLoader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { PresenceDot } from "@/components/shared/PresenceDot"
import { CollapsibleReplies } from "@/components/shared/CollapsibleReplies"
import {
  useFeatureRequestComments,
  useAddFeatureRequestComment,
  useEditFeatureRequestComment,
  useDeleteFeatureRequestComment,
  useSetFeatureRequestCommentReaction,
} from "@/hooks/useFeatureRequestComments"
import { useTypingIndicator } from "@/hooks/useTypingIndicator"
import { useAuth } from "@/contexts/AuthContext"
import { ApiError } from "@/transport/http"
import { groupIntoThreads } from "@/lib/commentThreads"
import type { FeatureRequestComment } from "@/types/featureRequest.types"

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"

function typingLabel(names: string[]) {
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]} are typing…`
}

interface RowProps {
  comment: FeatureRequestComment
  canModerate: boolean
  onReply: () => void
  onReact: (reaction: "like" | "dislike" | null) => void
}

function CommentRow({ comment, canModerate, onReply, onReact }: RowProps) {
  const { user } = useAuth()
  const editComment = useEditFeatureRequestComment(comment.featureRequestId)
  const deleteComment = useDeleteFeatureRequestComment(comment.featureRequestId)
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [deleting, setDeleting] = useState(false)

  const isMine = comment.author?.id === user?.id
  const canDelete = canModerate || isMine

  const saveEdit = () => {
    if (!editBody.trim()) return
    editComment.mutate(
      { commentId: comment.id, body: editBody.trim() },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to save"),
        onSuccess: () => setEditing(false),
      }
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="relative shrink-0">
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">{initials(comment.author?.name ?? "?")}</AvatarFallback>
        </Avatar>
        {comment.author && <PresenceDot userId={comment.author.id} className="absolute -bottom-0.5 -right-0.5" />}
      </div>
      <div className="min-w-0 flex-1 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{comment.author?.name ?? "Deleted user"}</span>
          {canDelete && !editing && (
            <div className="flex items-center gap-1">
              {isMine && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-6 p-0"
                  onClick={() => {
                    setEditBody(comment.body)
                    setEditing(true)
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="sm" className="size-6 p-0" onClick={() => setDeleting(true)}>
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5 space-y-2">
            <Textarea rows={2} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={editComment.isPending || !editBody.trim()}>
                {editComment.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {comment.body}
            {comment.editedAt && <span className="ml-1.5 text-xs italic text-muted-foreground/70">(edited)</span>}
          </p>
        )}

        {!editing && (
          <div className="mt-1.5 flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 gap-1 px-1.5 text-xs ${comment.reactions.myReaction === "like" ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => onReact(comment.reactions.myReaction === "like" ? null : "like")}
            >
              <ThumbsUp className="size-3.5" /> {comment.reactions.likeCount > 0 && comment.reactions.likeCount}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 gap-1 px-1.5 text-xs ${comment.reactions.myReaction === "dislike" ? "text-destructive" : "text-muted-foreground"}`}
              onClick={() => onReact(comment.reactions.myReaction === "dislike" ? null : "dislike")}
            >
              <ThumbsDown className="size-3.5" /> {comment.reactions.dislikeCount > 0 && comment.reactions.dislikeCount}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground" onClick={onReply}>
              <Reply className="mr-1 size-3" /> Reply
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete comment"
        description="This comment will be removed."
        confirmLabel="Delete"
        loading={deleteComment.isPending}
        onConfirm={() =>
          deleteComment.mutate(comment.id, {
            onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
            onSuccess: () => setDeleting(false),
          })
        }
      />
    </div>
  )
}

// canModerate: deleting anyone else's comment is the project's team lead's call,
// which is what the server checks on DELETE .../comments/:commentId. The parent
// already knows the project, so it says so.
export function CommentThread({
  requestId,
  canModerate,
}: {
  requestId: string
  canModerate: boolean
}) {
  const { data: comments, isLoading, isError } = useFeatureRequestComments(requestId)
  const addComment = useAddFeatureRequestComment(requestId)
  const setReaction = useSetFeatureRequestCommentReaction(requestId)
  const { typingUsers, notifyTyping } = useTypingIndicator(`feature-request:${requestId}`)
  const [body, setBody] = useState("")
  const [replyTo, setReplyTo] = useState<FeatureRequestComment | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Replying to a comment further up a long thread shouldn't leave the user
  // hunting for the composer at the bottom — bring it to them instead.
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      textareaRef.current?.focus()
    }
  }, [replyTo])

  const submit = () => {
    if (!body.trim()) return
    addComment.mutate(
      { body: body.trim(), parentId: replyTo?.id },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to add comment"),
        onSuccess: () => {
          setBody("")
          setReplyTo(null)
        },
      }
    )
  }

  const react = (commentId: string, reaction: "like" | "dislike" | null) => {
    setReaction.mutate(
      { commentId, reaction },
      { onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed") }
    )
  }

  const threads = groupIntoThreads(comments)

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Conversation ({comments.length})</h3>

      {isLoading && <InlineLoader className="py-6" />}

      {isError && (
        <p className="text-sm text-destructive">Couldn't connect to live comments — try refreshing.</p>
      )}

      {!isLoading && !isError && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}

      <div className="space-y-3">
        {threads.map(({ root, replies }) => (
          <div key={root.id} className="space-y-3">
            <CommentRow
              comment={root}
              canModerate={canModerate}
              onReply={() => setReplyTo(root)}
              onReact={(r) => react(root.id, r)}
            />
            <CollapsibleReplies
              replies={replies}
              renderReply={(r) => (
                <CommentRow
                  key={r.id}
                  comment={r}
                  canModerate={canModerate}
                  onReply={() => setReplyTo(r)}
                  onReact={(reaction) => react(r.id, reaction)}
                />
              )}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {replyTo && (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
            <span className="truncate">
              Replying to {replyTo.author?.name ?? "Deleted user"}: "{replyTo.body.slice(0, 60)}"
            </span>
            <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="h-4 text-xs text-muted-foreground">
          {typingUsers.length > 0 && typingLabel(typingUsers.map((u) => u.userName))}
        </div>
        <Textarea
          ref={textareaRef}
          rows={3}
          placeholder="Add a comment…"
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            notifyTyping()
          }}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={addComment.isPending || !body.trim()}>
            {addComment.isPending ? "Posting…" : "Post comment"}
          </Button>
        </div>
      </div>
    </div>
  )
}

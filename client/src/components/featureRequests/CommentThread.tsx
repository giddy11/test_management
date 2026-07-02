import { useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { InlineLoader } from "@/components/shared/PageLoader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { PresenceDot } from "@/components/shared/PresenceDot"
import {
  useFeatureRequestComments,
  useAddFeatureRequestComment,
  useDeleteFeatureRequestComment,
} from "@/hooks/useFeatureRequestComments"
import { useTypingIndicator } from "@/hooks/useTypingIndicator"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"
import { ApiError } from "@/transport/http"

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"

function typingLabel(names: string[]) {
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]} are typing…`
}

export function CommentThread({ requestId }: { requestId: string }) {
  const { user } = useAuth()
  const canModerate = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN
  const { data: comments, isLoading, isError } = useFeatureRequestComments(requestId)
  const addComment = useAddFeatureRequestComment(requestId)
  const deleteComment = useDeleteFeatureRequestComment(requestId)
  const { typingUsers, notifyTyping } = useTypingIndicator(requestId)
  const [body, setBody] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)

  const submit = () => {
    if (!body.trim()) return
    addComment.mutate(body.trim(), {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to add comment"),
      onSuccess: () => setBody(""),
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Comments ({comments.length})</h3>

      {isLoading && <InlineLoader className="py-6" />}

      {isError && (
        <p className="text-sm text-destructive">Couldn't connect to live comments — try refreshing.</p>
      )}

      {!isLoading && !isError && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}

      <div className="space-y-3">
        {comments.map((c) => {
          const canDelete = canModerate || c.author?.id === user?.id
          return (
            <div key={c.id} className="flex items-start gap-3">
              <div className="relative shrink-0">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{initials(c.author?.name ?? "?")}</AvatarFallback>
                </Avatar>
                {c.author && <PresenceDot userId={c.author.id} className="absolute -bottom-0.5 -right-0.5" />}
              </div>
              <div className="min-w-0 flex-1 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{c.author?.name ?? "Deleted user"}</span>
                  {canDelete && (
                    <Button variant="ghost" size="sm" className="size-6 p-0" onClick={() => setDeleting(c.id)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{c.body}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-2">
        <div className="h-4 text-xs text-muted-foreground">
          {typingUsers.length > 0 && typingLabel(typingUsers.map((u) => u.userName))}
        </div>
        <Textarea
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

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete comment"
        description="This comment will be removed."
        confirmLabel="Delete"
        loading={deleteComment.isPending}
        onConfirm={() =>
          deleting &&
          deleteComment.mutate(deleting, {
            onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
            onSuccess: () => setDeleting(null),
          })
        }
      />
    </div>
  )
}

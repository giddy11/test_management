// A ticket's back-and-forth comment thread — the internal (staff) side.
// Plain REST + a short poll (see useFeedback.ts) rather than the realtime
// Firestore listener feature-request comments use, since the other side of
// this conversation (the ticket's submitter) has no app/Firebase auth token.
import { useRef, useState } from "react"
import { FileText, Paperclip, Send, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { InlineLoader } from "@/components/shared/PageLoader"
import {
  useAddFeedbackComment,
  useAddSupportComment,
  useFeedbackComments,
  useSupportComments,
} from "@/hooks/useFeedback"
import { useAuth } from "@/contexts/AuthContext"
import { ApiError } from "@/transport/http"
import type { FeedbackComment, FeedbackCommentAttachment } from "@/types/feedback.types"

const MAX_ATTACHMENTS = 5
const MAX_FILE_MB = 10
const ACCEPT =
  "image/png,image/jpeg,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentChip({ attachment }: { attachment: FeedbackCommentAttachment }) {
  if (attachment.mimeType.startsWith("image/")) {
    return (
      <a href={attachment.fileUrl} target="_blank" rel="noreferrer">
        <img
          src={attachment.fileUrl}
          alt={attachment.fileName}
          className="size-20 rounded-md border object-cover transition-opacity hover:opacity-80"
        />
      </a>
    )
  }
  return (
    <a
      href={attachment.fileUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-accent"
    >
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="max-w-[10rem] truncate">{attachment.fileName}</span>
      <span className="text-muted-foreground">{formatBytes(attachment.fileSizeBytes)}</span>
    </a>
  )
}

function CommentRow({ comment, isMine }: { comment: FeedbackComment; isMine: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="text-xs">{initials(comment.authorName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{comment.authorName}</span>
          <Badge variant={comment.authorType === "submitter" ? "outline" : "secondary"} className="text-[10px]">
            {isMine ? "You" : comment.authorType === "submitter" ? "Submitter" : "Staff"}
          </Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(comment.createdAt).toLocaleString()}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{comment.body}</p>
        {comment.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {comment.attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function TicketCommentThread({ feedbackId, support = false }: { feedbackId: string; support?: boolean }) {
  const { user } = useAuth()

  // Both hook pairs are always called (rules of hooks) — `enabled`/inert
  // mutations mean only the relevant one actually does anything.
  const productComments = useFeedbackComments(feedbackId, !support)
  const supportComments = useSupportComments(feedbackId, support)
  const { data: comments = [], isLoading, isError } = support ? supportComments : productComments

  const addProductComment = useAddFeedbackComment(feedbackId)
  const addSupportComment = useAddSupportComment(feedbackId)
  const addComment = support ? addSupportComment : addProductComment

  const [body, setBody] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = Array.from(list)
    const tooBig = next.find((f) => f.size > MAX_FILE_MB * 1024 * 1024)
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over ${MAX_FILE_MB}MB`)
      return
    }
    setFiles((prev) => {
      const combined = [...prev, ...next]
      if (combined.length > MAX_ATTACHMENTS) {
        toast.error(`Up to ${MAX_ATTACHMENTS} attachments per message`)
        return combined.slice(0, MAX_ATTACHMENTS)
      }
      return combined
    })
  }

  const submit = () => {
    if (!body.trim()) return
    addComment.mutate(
      { body: body.trim(), files },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed to post message"),
        onSuccess: () => {
          setBody("")
          setFiles([])
        },
      }
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Conversation ({comments.length})</h3>

      {isLoading && <InlineLoader className="py-6" />}

      {isError && (
        <p className="text-sm text-destructive">Couldn't load the conversation — try again shortly.</p>
      )}

      {!isLoading && !isError && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No messages yet — ask the submitter here if you need more information or a document.
        </p>
      )}

      <div className="space-y-3">
        {comments.map((c) => (
          <CommentRow key={c.id} comment={c} isMine={c.authorType === "staff" && c.authorId === user?.id} />
        ))}
      </div>

      <div className="space-y-2">
        <Textarea
          rows={3}
          placeholder="Ask for more information, or let the submitter know what's needed…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-xs"
              >
                {f.name}
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ""
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_ATTACHMENTS}
          >
            <Paperclip className="mr-1.5 size-3.5" />
            Attach
          </Button>
          <Button size="sm" onClick={submit} disabled={addComment.isPending || !body.trim()}>
            <Send className="mr-1.5 size-3.5" />
            {addComment.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  )
}

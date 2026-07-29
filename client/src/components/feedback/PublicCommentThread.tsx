// The submitter-facing comment thread body (list + composer) — shared by the
// "My Tickets" dialog (TicketThreadDialog) and the public confirmation-link
// page (PublicFeedbackConfirmPage). They differ only in how a reply proves
// ownership (email+code vs. the ticket id alone as a bearer credential), so
// that's injected as `onSubmit` rather than duplicated here. Reads are the
// same realtime Firestore listener staff use (see useFeedbackCommentThread —
// Firestore only requires "signed in, even anonymously" for this collection).
import { useRef, useState } from "react"
import { FileText, Paperclip, Send, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { useFeedbackCommentThread } from "@/hooks/useFeedbackComments"
import type { ApiResponse } from "@/types/api.types"
import type { FeedbackCommentAttachment } from "@/types/feedback.types"

const MAX_ATTACHMENTS = 5
const MAX_FILE_MB = 10
const ACCEPT =
  "image/png,image/jpeg,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentChip({ attachment }: { attachment: FeedbackCommentAttachment }) {
  if (attachment.mimeType?.startsWith("image/")) {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer">
        <img
          src={attachment.url}
          alt={attachment.name ?? "Attachment"}
          className="size-20 rounded-md border object-cover transition-opacity hover:opacity-80"
        />
      </a>
    )
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-accent"
    >
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="max-w-[10rem] truncate">{attachment.name ?? "Attachment"}</span>
      {attachment.bytes != null && <span className="text-muted-foreground">{formatBytes(attachment.bytes)}</span>}
    </a>
  )
}

interface Props {
  feedbackId: string
  onSubmit: (body: string, files: File[]) => Promise<ApiResponse<unknown>>
}

export function PublicCommentThread({ feedbackId, onSubmit }: Props) {
  const { data: comments, isLoading, isError } = useFeedbackCommentThread(feedbackId)
  const [body, setBody] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
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

  const submit = async () => {
    if (!body.trim()) return
    setSending(true)
    try {
      const res = await onSubmit(body.trim(), files)
      if (res.success) {
        setBody("")
        setFiles([])
      } else {
        toast.error(res.message || "Failed to send")
      }
    } catch {
      toast.error("Failed to send")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && isError && (
        <p className="text-sm text-destructive">Couldn't load the conversation — try again shortly.</p>
      )}

      {!isLoading && !isError && (
        <>
          {comments.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {c.authorType === "submitter" ? "You" : c.authorName}
                  </span>
                  <Badge variant={c.authorType === "submitter" ? "outline" : "secondary"} className="text-[10px]">
                    {c.authorType === "submitter" ? "You" : "Support"}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.body}</p>
                {c.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.attachments.map((a, i) => (
                      <AttachmentChip key={`${a.url}-${i}`} attachment={a} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Textarea
              rows={3}
              placeholder="Reply, or attach the document that was requested…"
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
              <Button size="sm" onClick={submit} disabled={sending || !body.trim()}>
                <Send className="mr-1.5 size-3.5" />
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

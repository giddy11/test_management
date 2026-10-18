// components/serviceDesk/RequestConversation.tsx — the conversation on an IT
// request: messages and their replies (one level deep, like bug comments),
// @mentions, files on a message, editing and deleting. Internal notes are IT's
// own; the server never sends one to anyone else, so nothing here hides them.
import { useEffect, useRef, useState } from "react"
import { FileText, Info, Lock, MessageSquare, Paperclip, Pencil, Reply, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { CollapsibleReplies } from "@/components/shared/CollapsibleReplies"
import { MentionText } from "@/components/shared/MentionText"
import { MentionTextarea, type MentionCandidate } from "@/components/shared/MentionTextarea"
import { Spinner } from "@/components/shared/Spinner"
import { When } from "@/components/serviceDesk/RequestBits"
import { ACCEPT, MAX_MB, prettySize } from "@/components/serviceDesk/RequestFiles"
import { useCommentOnRequest, useDeleteComment, useDeleteRequestFile, useEditComment } from "@/hooks/useServiceDesk"
import { groupIntoThreads } from "@/lib/commentThreads"
import { cn } from "@/lib/utils"
import { ApiError } from "@/transport/http"
import type { RequestAttachment, RequestComment, RequestDetail, RequestMentionable } from "@/types/serviceDesk.types"

const MAX_FILES = 5 // per message — mirrors the server

const INTERNAL_NOTE_HELP =
  "Only IT can read an internal note. The requester, the person it's for and approvers can't see it and aren't told about it. Use it for hand-offs and technical details."

const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

const initials = (name: string | null) =>
  (name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"

// Who is still named in the text (picking a suggestion then deleting it from
// the text shouldn't still notify them) and may be named here.
function mentionIdsIn(text: string, picked: MentionCandidate[], pool: RequestMentionable[]): string[] {
  return picked.filter((u) => text.includes(`@${u.name}`) && pool.some((p) => p.id === u.id)).map((u) => u.id)
}

function keepValidFiles(picked: File[], have: number): File[] {
  const tooBig = picked.filter((f) => f.size > MAX_MB * 1024 * 1024)
  if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over ${MAX_MB} MB`)
  const ok = picked.filter((f) => f.size <= MAX_MB * 1024 * 1024)
  const room = Math.max(MAX_FILES - have, 0)
  if (ok.length > room) toast.error(`A message can carry at most ${MAX_FILES} files`)
  return ok.slice(0, room)
}

function InternalTag() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-0.5 text-xs text-muted-foreground">
          <Lock className="size-3" /> internal
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{INTERNAL_NOTE_HELP}</TooltipContent>
    </Tooltip>
  )
}

function SentFiles({ files }: { files: RequestAttachment[] }) {
  if (!files.length) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={f.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md border bg-background p-1.5 text-xs hover:bg-accent/40"
            title={f.fileName}
          >
            {f.isImage ? (
              <img src={f.fileUrl} alt={f.fileName} className="size-10 rounded object-cover" />
            ) : (
              <span className="flex size-10 items-center justify-center rounded bg-muted">
                <FileText className="size-4 text-muted-foreground" />
              </span>
            )}
            <span className="max-w-40">
              <span className="block truncate">{f.fileName}</span>
              {f.fileSizeBytes ? <span className="text-muted-foreground">{prettySize(f.fileSizeBytes)}</span> : null}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

// A picked file, before it is sent.
function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={`${f.name}-${f.lastModified}-${i}`} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
          <Paperclip className="size-3 text-muted-foreground" />
          <span className="max-w-40 truncate">{f.name}</span>
          <span className="text-muted-foreground">{prettySize(f.size)}</span>
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onRemove(i)}>
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function Message({
  requestId,
  comment,
  mentionable,
  myUserId,
  canModerate,
  onReply,
}: {
  requestId: string
  comment: RequestComment
  mentionable: RequestMentionable[]
  myUserId: string
  canModerate: boolean
  onReply: () => void
}) {
  const edit = useEditComment()
  const remove = useDeleteComment()
  const removeFile = useDeleteRequestFile()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(comment.body)
  const [picked, setPicked] = useState<MentionCandidate[]>(comment.mentions)
  const [deleting, setDeleting] = useState(false)

  const deleted = !!comment.deletedAt
  const mine = comment.authorId === myUserId
  // An IT-only note can only name IT.
  const pool = mentionable.filter((p) => !comment.isInternal || p.isAgent)

  const startEdit = () => {
    setText(comment.body)
    setPicked(comment.mentions)
    setEditing(true)
  }
  const save = () => {
    if (!text.trim()) return
    edit.mutate(
      { id: requestId, commentId: comment.id, body: text.trim(), mentionIds: mentionIdsIn(text, picked, pool) },
      { onSuccess: () => setEditing(false), onError: fail }
    )
  }

  return (
    <div className="flex items-start gap-3" data-cy="request-message">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="text-xs">{initials(comment.authorName)}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "min-w-0 flex-1 rounded-lg border p-3",
          comment.isInternal && "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="text-sm font-medium text-foreground">{comment.authorName ?? "Someone"}</span>·
            <When at={comment.createdAt} />
            {comment.isInternal && <InternalTag />}
          </p>
          {!deleted && !editing && (
            <div className="flex items-center gap-0.5">
              {mine && (
                <Button variant="ghost" size="icon-sm" aria-label="Edit message" title="Edit" onClick={startEdit}>
                  <Pencil className="size-3.5" />
                </Button>
              )}
              {(mine || canModerate) && (
                <Button variant="ghost" size="icon-sm" aria-label="Delete message" title="Delete" onClick={() => setDeleting(true)}>
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              )}
            </div>
          )}
        </div>

        {deleted ? (
          <p className="mt-1 text-sm italic text-muted-foreground">This message was deleted.</p>
        ) : editing ? (
          <div className="mt-2 space-y-2">
            <MentionTextarea
              rows={3}
              value={text}
              onValueChange={setText}
              onMention={(u) => setPicked((prev) => (prev.some((p) => p.id === u.id) ? prev : [...prev, u]))}
              users={pool}
            />
            {comment.attachments.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {comment.attachments.map((f) => (
                  <li key={f.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                    <Paperclip className="size-3 text-muted-foreground" />
                    <span className="max-w-40 truncate">{f.fileName}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.fileName}`}
                      disabled={removeFile.isPending}
                      onClick={() => removeFile.mutate({ id: requestId, attachmentId: f.id }, { onError: fail })}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={edit.isPending || !text.trim()}>
                {edit.isPending ? <Spinner className="mr-1" /> : null}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {comment.body && (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                <MentionText body={comment.body} mentions={comment.mentions} />
                {comment.editedAt && <span className="ml-1.5 text-xs italic text-muted-foreground">(edited)</span>}
              </p>
            )}
            <SentFiles files={comment.attachments} />
            <div className="mt-1.5">
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground" onClick={onReply}>
                <Reply className="mr-1 size-3" /> Reply
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete message"
        description={`It will be replaced by "This message was deleted" and its files removed.${
          mine ? "" : " You're deleting someone else's message."
        } Replies stay.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { id: requestId, commentId: comment.id },
            { onSuccess: () => setDeleting(false), onError: (e) => (setDeleting(false), fail(e)) }
          )
        }
      />
    </div>
  )
}

export function RequestConversation({ detail }: { detail: RequestDetail }) {
  const { request: r, viewer, comments, mentionable } = detail
  const post = useCommentOnRequest()
  const [body, setBody] = useState("")
  const [internal, setInternal] = useState(false)
  const [replyTo, setReplyTo] = useState<RequestComment | null>(null)
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [files, setFiles] = useState<File[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Replying far up a long thread shouldn't leave the person hunting for the box.
  useEffect(() => {
    if (!replyTo) return
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    textareaRef.current?.focus()
  }, [replyTo])

  if (r.status === "draft") return null

  // A reply to an IT-only note is itself IT-only (the server enforces it too).
  const internalNow = internal || !!replyTo?.isInternal
  const pool = mentionable.filter((p) => !internalNow || p.isAgent)
  const threads = groupIntoThreads(comments)
  const live = comments.filter((c) => !c.deletedAt).length
  const canSend = (body.trim().length > 0 || files.length > 0) && !post.isPending

  const send = () => {
    if (!canSend) return
    post.mutate(
      {
        id: r.id,
        body: body.trim(),
        internal: internalNow,
        parentId: replyTo?.id ?? null,
        mentionIds: mentionIdsIn(body, picked, pool),
        files,
      },
      {
        onSuccess: () => {
          setBody("")
          setInternal(false)
          setReplyTo(null)
          setPicked([])
          setFiles([])
        },
        onError: fail,
      }
    )
  }

  const row = (c: RequestComment) => (
    <Message
      key={c.id}
      requestId={r.id}
      comment={c}
      mentionable={mentionable}
      myUserId={viewer.myUserId}
      canModerate={viewer.canModerateComments}
      onReply={() => setReplyTo(c)}
    />
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <MessageSquare className="size-4" /> Conversation{live ? ` (${live})` : ""}
        </CardTitle>
        <CardDescription>Everyone on this request can see messages. Internal notes are IT-only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
        {threads.map(({ root, replies }) => (
          <div key={root.id} className="space-y-3">
            {row(root)}
            <CollapsibleReplies replies={replies} renderReply={row} />
          </div>
        ))}

        {viewer.canComment && (
          <div className="space-y-2 border-t pt-3">
            {replyTo && (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                <span className="truncate">
                  Replying to {replyTo.authorName ?? "someone"}
                  {replyTo.body ? `: “${replyTo.body.slice(0, 60)}${replyTo.body.length > 60 ? "…" : ""}”` : ""}
                </span>
                <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <MentionTextarea
              textareaRef={textareaRef}
              rows={3}
              placeholder={replyTo ? "Write a reply…" : "Write a message… use @ to mention someone"}
              value={body}
              onValueChange={setBody}
              onMention={(u) => setPicked((prev) => (prev.some((p) => p.id === u.id) ? prev : [...prev, u]))}
              users={pool}
            />
            <PendingFiles files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                setFiles([...files, ...keepValidFiles(Array.from(e.target.files ?? []), files.length)])
                if (fileInput.current) fileInput.current.value = ""
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={files.length >= MAX_FILES || post.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip className="mr-1 size-3.5" /> Attach files
                </Button>
                {viewer.canAddInternalNote && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={internalNow}
                        disabled={!!replyTo?.isInternal}
                        onCheckedChange={(v) => setInternal(v === true)}
                      />
                      Internal note (IT only)
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="What is an internal note?" className="text-muted-foreground hover:text-foreground">
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">{INTERNAL_NOTE_HELP}</TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
              <Button size="sm" disabled={!canSend} onClick={send} data-cy="request-send">
                {post.isPending ? <Spinner className="mr-1" /> : null}
                {replyTo ? "Reply" : internalNow ? "Add note" : "Send"}
              </Button>
            </div>
            {internalNow && (
              <p className="text-xs text-muted-foreground">
                {replyTo?.isInternal ? "This replies to an internal note, so it is internal too. " : ""}
                {INTERNAL_NOTE_HELP} Only IT can be @mentioned in it.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Up to {MAX_FILES} files per message — images, PDF, Word or Excel, {MAX_MB} MB each.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

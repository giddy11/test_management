// components/review/ReviewPromptDialog.tsx
// Now and then, asks whoever reported a bug or feature request that is marked
// ready to confirm it, and reminds assignees of the work still waiting on them,
// which they can mark done from here.
// The server decides when one is due (the platform owner sets how often); this
// only asks every few minutes and shows what comes back. Reviews come first, one
// at a time, then the assigned work as a single list.
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ReviewPromptEndpoints } from "@/endpoints/reviewPrompt.endpoints"
import { useAnswerReview, useSubmitForReview } from "@/hooks/useReviewPrompts"
import { FEATURE_REQUEST_STATUS_META, type FeatureRequestStatus } from "@/lib/enums"
import { ApiError } from "@/transport/http"
import type { ReviewAnswer, ReviewItem, WorkItem } from "@/types/reviewPrompt.types"

const CHECK_EVERY_MS = 5 * 60_000
// Long enough after loading for any other start-up dialog to have appeared.
const FIRST_CHECK_MS = 5_000

const COPY = {
  bug: {
    label: "Bug",
    question: "This bug is marked Fixed. Is it fixed for you?",
    approve: "Yes, close it",
    approved: "Bug closed",
    rejected: "Bug reopened",
    path: "bugs",
    note: null,
    submit: "Mark Fixed",
    submitted: "Bug marked Fixed",
  },
  feature_request: {
    label: "Feature request",
    question: "This request is Ready For Review. Does it do what you asked for?",
    approve: "Yes, mark it done",
    approved: "Feature request marked done",
    rejected: "Sent back to In Progress",
    path: "feature-requests",
    note: "Done is final: the request can't be changed afterwards.",
    submit: "Mark Ready For Review",
    submitted: "Marked Ready For Review",
  },
} as const

// Asking would interrupt: the tab isn't being looked at, someone is typing, or
// another dialog is open. Waiting costs nothing, because the server only starts
// the interval once it has handed items out.
function isBadMoment() {
  if (document.visibilityState !== "visible") return true
  const focused = document.activeElement
  if (focused?.matches("input, textarea, select, [contenteditable='true']")) return true
  return Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'))
}

const itemPath = (item: ReviewItem | WorkItem) =>
  `/projects/${item.projectId}/${COPY[item.type].path}/${item.id}`

const statusLabel = (item: WorkItem) =>
  item.type === "bug"
    ? item.status
    : (FEATURE_REQUEST_STATUS_META[item.status as FeatureRequestStatus]?.label ?? item.status)

function AssignedWorkList({
  work,
  onOpen,
  onGone,
}: {
  work: WorkItem[]
  onOpen: (item: WorkItem) => void
  /** The item is no longer waiting on this user. */
  onGone: (item: WorkItem) => void
}) {
  const submit = useSubmitForReview()
  // Marking something done can't be undone by the assignee, so it takes two clicks.
  const [confirming, setConfirming] = useState<string | null>(null)

  const send = (item: WorkItem) =>
    submit.mutate(item, {
      onSuccess: () => {
        toast.success(COPY[item.type].submitted)
        onGone(item)
      },
      onError: (e) => {
        toast.error(e instanceof ApiError ? e.message : "Couldn't update it")
        // Reassigned, moved on or deleted: not theirs to finish any more.
        if (e instanceof ApiError && [403, 404, 409].includes(e.statusCode)) onGone(item)
      },
    })

  return (
    <ul className="max-h-72 min-w-0 divide-y overflow-y-auto rounded-md border" data-cy="review-assigned">
      {work.map((item) => {
        const key = `${item.type}:${item.id}`
        return (
          <li key={key} className="px-3 py-2">
            <button type="button" className="group block w-full text-left" onClick={() => onOpen(item)}>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{COPY[item.type].label}</Badge>
                <span>{item.referenceCode}</span>
                <span>· {statusLabel(item)}</span>
                <span>· {item.projectName}</span>
              </span>
              <span className="mt-1 block break-words text-sm font-medium group-hover:underline">
                {item.title}
              </span>
            </button>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              {confirming === key ? (
                <>
                  <span className="mr-auto text-xs text-muted-foreground">
                    Goes to the reporter to confirm. You can't undo this.
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={submit.isPending} onClick={() => send(item)}>
                    {submit.isPending ? "Saving…" : "Confirm"}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" disabled={submit.isPending} onClick={() => setConfirming(key)}>
                  {COPY[item.type].submit}
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function ReviewPromptDialog() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [work, setWork] = useState<WorkItem[]>([])
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const contentRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const answer = useAnswerReview()
  const current = items[0]
  const open = items.length > 0 || work.length > 0

  useEffect(() => {
    if (open) return
    let cancelled = false
    const check = async () => {
      if (isBadMoment()) return
      try {
        const res = await ReviewPromptEndpoints.claim()
        if (!cancelled && res.success && res.data) {
          setItems(res.data.items)
          setWork(res.data.work)
        }
      } catch {
        // A reminder is never worth an error message; the next check retries.
      }
    }
    const first = window.setTimeout(check, FIRST_CHECK_MS)
    const every = window.setInterval(check, CHECK_EVERY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(first)
      window.clearInterval(every)
    }
  }, [open])

  const resetForm = () => {
    setRejecting(false)
    setReason("")
  }
  const next = () => {
    resetForm()
    setItems((list) => list.slice(1))
  }
  const close = () => {
    resetForm()
    setItems([])
    setWork([])
  }
  const openItem = (item: ReviewItem | WorkItem) => {
    close()
    navigate(itemPath(item))
  }
  const dropWork = (gone: WorkItem) =>
    setWork((list) => list.filter((w) => w.type !== gone.type || w.id !== gone.id))

  const send = (item: ReviewItem, response: ReviewAnswer) => {
    answer.mutate(
      { item, answer: response },
      {
        onSuccess: () => {
          toast.success(response.approved ? COPY[item.type].approved : COPY[item.type].rejected)
          next()
        },
        onError: (e) => {
          toast.error(e instanceof ApiError ? e.message : "Couldn't save your answer")
          // Someone else moved it on, or it was deleted: nothing left to answer.
          if (e instanceof ApiError && (e.statusCode === 404 || e.statusCode === 409)) next()
        },
      }
    )
  }

  if (!open) return null
  const copy = current ? COPY[current.type] : null

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && close()}>
      <DialogContent
        ref={contentRef}
        className="sm:max-w-lg"
        data-cy="review-prompt"
        // It appears unasked, so no button takes focus (a stray Enter would answer
        // it) and a click elsewhere doesn't throw away a half-written reason.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          contentRef.current?.focus()
        }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{current ? "Waiting for your review" : "Assigned to you"}</DialogTitle>
          <DialogDescription>
            {copy
              ? `${copy.question}${items.length > 1 ? ` (${items.length} items waiting)` : ""}`
              : `${work.length} item${work.length === 1 ? " is" : "s are"} still waiting for your work.`}
          </DialogDescription>
        </DialogHeader>

        {current && copy ? (
          <>
            <div className="min-w-0 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{copy.label}</Badge>
                <span>{current.referenceCode}</span>
                <span>· {current.projectName}</span>
              </div>
              <p className="mt-1.5 break-words text-sm font-medium">{current.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {current.assigneeName && `Assigned to ${current.assigneeName}`}
                {current.assigneeName && current.readySince && " · "}
                {current.readySince && `ready since ${new Date(current.readySince).toLocaleDateString()}`}
              </p>
              <Button
                variant="link"
                className="mt-1 h-auto p-0 text-xs"
                onClick={() => openItem(current)}
              >
                View details
              </Button>
            </div>

            {rejecting ? (
              <div className="grid gap-1.5">
                <Label htmlFor="review-reason">What is still wrong?</Label>
                <Textarea
                  id="review-reason"
                  autoFocus
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Posted as a comment for the team"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={resetForm}>
                    Back
                  </Button>
                  <Button
                    disabled={!reason.trim() || answer.isPending}
                    onClick={() => send(current, { approved: false, reason: reason.trim() })}
                  >
                    {answer.isPending ? "Sending…" : "Send back"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <div className="flex flex-wrap gap-2">
                  <Button disabled={answer.isPending} onClick={() => send(current, { approved: true })}>
                    {answer.isPending ? "Saving…" : copy.approve}
                  </Button>
                  <Button variant="outline" disabled={answer.isPending} onClick={() => setRejecting(true)}>
                    Not yet
                  </Button>
                </div>
                {copy.note && <p className="text-xs text-muted-foreground">{copy.note}</p>}
              </div>
            )}
          </>
        ) : (
          <AssignedWorkList work={work} onOpen={openItem} onGone={dropWork} />
        )}

        <DialogFooter>
          {current && (items.length > 1 || work.length > 0) && (
            <Button variant="ghost" disabled={answer.isPending} onClick={next}>
              Skip this one
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Remind me later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

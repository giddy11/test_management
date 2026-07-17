// The triage dialog for a feedback item — status (strictly sequential),
// assignees (managers only), and the note emailed to the external contact.
// Used by the project Feedback tab and the global All-feedback page.
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFeedbackHistory, useManageFeedback } from "@/hooks/useFeedback"
import { FeedbackTimeline } from "@/components/feedback/FeedbackTimeline"
import { ApiError } from "@/transport/http"
import type { ProjectMember } from "@/types/project.types"
import {
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type Feedback,
  type FeedbackStatus,
} from "@/types/feedback.types"

export function FeedbackManageDialog({
  feedback,
  members,
  canReassign,
  onOpenChange,
}: {
  feedback: Feedback | null
  members: ProjectMember[]
  canReassign: boolean
  onOpenChange: (open: boolean) => void
}) {
  const manage = useManageFeedback()
  const { data: history = [] } = useFeedbackHistory(feedback?.id ?? "", Boolean(feedback))
  const [status, setStatus] = useState<FeedbackStatus | "">("")
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(new Set())
  // Once an item already has assignees, the checklist stays locked behind this
  // checkbox — so reviewing an item doesn't risk accidentally adding/removing
  // an assignee. Unassigned items skip the gate; there's nothing to disturb.
  const [editAssignees, setEditAssignees] = useState(false)
  const [response, setResponse] = useState("")
  // The note is opt-in — it goes in the email, and most updates don't need one.
  const [includeNote, setIncludeNote] = useState(false)

  // Sync local state when a new item is opened.
  const [lastId, setLastId] = useState<string | null>(null)
  if (feedback && feedback.id !== lastId) {
    setLastId(feedback.id)
    setStatus(feedback.status)
    setAssigneeIds(new Set(feedback.assignees.map((a) => a.id)))
    setEditAssignees(feedback.assignees.length === 0)
    setResponse(feedback.adminResponse ?? "")
    setIncludeNote(Boolean(feedback.adminResponse))
  }

  const toggleAssignee = (id: string) =>
    setAssigneeIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // The workflow is strictly sequential — only the current stage or the very
  // next one can be picked, so a stage can't be skipped or reversed.
  const currentIndex = feedback ? FEEDBACK_STATUSES.indexOf(feedback.status) : -1
  const nextStatus = currentIndex >= 0 ? FEEDBACK_STATUSES[currentIndex + 1] : undefined
  const isStatusSelectable = (s: FeedbackStatus) => s === feedback?.status || s === nextStatus

  // Assigning only makes sense once the workflow reaches "assigned" — showing
  // the picker earlier invites assigning people at the wrong stage. It appears
  // as soon as "assigned" is the selected (or current) stage.
  const effectiveStatus = status || feedback?.status
  const showAssignees = effectiveStatus
    ? FEEDBACK_STATUSES.indexOf(effectiveStatus) >= FEEDBACK_STATUSES.indexOf("assigned")
    : false

  const save = () => {
    if (!feedback) return
    manage.mutate(
      {
        id: feedback.id,
        payload: {
          status: status || undefined,
          // Reassigning is a management action — assignees can update status
          // and leave a note, but the backend rejects this field from them.
          // Only sent while the picker is visible (stage ≥ assigned) and
          // actually editable (unassigned, or "Change assignees" was checked).
          assignedToIds: canReassign && showAssignees && editAssignees ? [...assigneeIds] : undefined,
          // Unchecking the note box clears any previous note.
          adminResponse: includeNote ? response || null : null,
        },
      },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => {
          toast.success("Ticket updated — the submitter will be emailed if the stage changed")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={Boolean(feedback)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage ticket{feedback && ` #${feedback.ticketNumber}`}</DialogTitle>
          <DialogDescription>
            {feedback?.title} — from {feedback?.submitterName}
            {feedback?.submitterPhone && <> · {feedback.submitterPhone}</>}
          </DialogDescription>
        </DialogHeader>

        {feedback && (
          <div className="grid gap-4">
            {feedback.escalatedAt && (
              <div className="rounded-md border-l-3 border-primary bg-primary/10 px-3 py-2">
                <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-primary">
                  Escalated from {feedback.clientCompanyName ?? "a client company"}
                  {feedback.escalatedByName && <> by {feedback.escalatedByName}</>} ·{" "}
                  {new Date(feedback.escalatedAt).toLocaleDateString()}
                  {feedback.severity && (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      {FEEDBACK_SEVERITY_LABELS[feedback.severity]} severity
                    </Badge>
                  )}
                </p>
                {feedback.supportResponse && (
                  <p className="mt-0.5 whitespace-pre-line text-sm">{feedback.supportResponse}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Stage emails go to the IT supporter — they relay to their end user.
                </p>
              </div>
            )}

            <p className="max-h-40 overflow-y-auto whitespace-pre-line rounded-md bg-muted p-3 text-sm">
              {feedback.description}
            </p>

            {feedback.externalRef && (
              <p className="text-xs text-muted-foreground">
                External ref: <code className="rounded bg-muted px-1 py-0.5">{feedback.externalRef}</code>
              </p>
            )}

            {feedback.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {feedback.attachments.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                    <img
                      src={a.url}
                      alt="Attachment"
                      className="size-20 rounded-md border object-cover transition-opacity hover:opacity-80"
                    />
                  </a>
                ))}
              </div>
            )}

            {feedback.reopenReason && (
              <div className="rounded-md border-l-3 border-amber-500 bg-amber-500/10 px-3 py-2">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Submitter said this isn't fixed:
                </p>
                <p className="mt-0.5 whitespace-pre-line text-sm">{feedback.reopenReason}</p>
              </div>
            )}

            {history.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Timeline</Label>
                <div className="rounded-md border p-3">
                  <FeedbackTimeline history={history} />
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as FeedbackStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FEEDBACK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} disabled={!isStatusSelectable(s)}>
                      {FEEDBACK_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {nextStatus
                  ? `Next stage: ${FEEDBACK_STATUS_LABELS[nextStatus]}`
                  : "Already at the final stage"}
              </p>
            </div>

            {showAssignees && (
            <div className="grid gap-1.5">
              <Label>Assign to{canReassign ? " (project members only)" : ""}</Label>
              {!canReassign ? (
                feedback.assignees.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {feedback.assignees.map((a) => (
                      <Badge key={a.id} variant="secondary" className="text-xs">
                        {a.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Unassigned</p>
                )
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This project has no members yet — add members to assign the ticket.
                </p>
              ) : !editAssignees ? (
                <>
                  <div className="flex flex-wrap gap-1">
                    {feedback.assignees.map((a) => (
                      <Badge key={a.id} variant="secondary" className="text-xs">
                        {a.name}
                      </Badge>
                    ))}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={editAssignees}
                      onCheckedChange={(v) => setEditAssignees(Boolean(v))}
                    />
                    <span className="text-sm">Change assignees</span>
                  </label>
                </>
              ) : (
                <>
                  {feedback.assignees.length > 0 && (
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={editAssignees}
                        onCheckedChange={(v) => {
                          const next = Boolean(v)
                          setEditAssignees(next)
                          if (!next) setAssigneeIds(new Set(feedback.assignees.map((a) => a.id)))
                        }}
                      />
                      <span className="text-sm">Change assignees</span>
                    </label>
                  )}
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-1">
                    {members.map((m) => {
                      const initials = m.name
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                      return (
                        <label
                          key={m.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                        >
                          <Checkbox
                            checked={assigneeIds.has(m.id)}
                            onCheckedChange={() => toggleAssignee(m.id)}
                          />
                          <Avatar className="size-7">
                            <AvatarFallback className="text-xs">{initials || "U"}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{m.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  {assigneeIds.size > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {[...assigneeIds].map((id) => {
                        const m = members.find((m) => m.id === id)
                        if (!m) return null
                        return (
                          <Badge key={id} variant="secondary" className="gap-1 text-xs">
                            {m.name}
                            <button
                              type="button"
                              className="ml-0.5 rounded-full hover:text-destructive"
                              onClick={() => toggleAssignee(id)}
                            >
                              ×
                            </button>
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            )}

            <div className="grid gap-1.5">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={includeNote}
                  onCheckedChange={(v) => setIncludeNote(Boolean(v))}
                />
                <span className="text-sm font-medium">
                  Include a note to the {feedback.escalatedAt ? "IT supporter" : "submitter"} — it
                  goes in the update email
                </span>
              </label>
              {includeNote && (
                <Textarea
                  id="fb-response"
                  rows={3}
                  maxLength={3000}
                  placeholder="This note is emailed with the status update…"
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  autoFocus
                />
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={manage.isPending}>
            {manage.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

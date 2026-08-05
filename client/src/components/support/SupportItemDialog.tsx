// Detail view of a queue item for IT supporters. The workflow is strictly
// sequential (Logged → Acknowledged → Investigating) — the end user is
// emailed at every stage change — and only from Investigating can the item be
// resolved locally (required note, emailed) or escalated to the product team.
import { useState } from "react"
import { ArrowUpRight, CheckCircle2, MailCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { FeedbackTimeline } from "@/components/feedback/FeedbackTimeline"
import { TicketCommentThread } from "@/components/feedback/TicketCommentThread"
import {
  useAssignSupportItem,
  useEscalateSupportItem,
  useNotifySubmitterFixed,
  useResolveSupportItem,
  useSupportHistory,
  useSupportTeammates,
  useUpdateSupportStatus,
} from "@/hooks/useFeedback"
import { useAuth } from "@/contexts/AuthContext"
import { ApiError } from "@/transport/http"
import {
  FEEDBACK_SEVERITIES,
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  SUPPORT_PROGRESSION,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  type Feedback,
  type FeedbackSeverity,
  type SupportStatus,
} from "@/types/feedback.types"

interface Props {
  feedback: Feedback | null
  onOpenChange: (open: boolean) => void
}

export function SupportItemDialog({ feedback, onOpenChange }: Props) {
  const { user } = useAuth()
  const isLead = Boolean(user?.isSupportLead)
  const updateStatus = useUpdateSupportStatus()
  const resolve = useResolveSupportItem()
  const escalate = useEscalateSupportItem()
  const notifySubmitter = useNotifySubmitterFixed()
  const assign = useAssignSupportItem()
  const { data: history = [] } = useSupportHistory(feedback?.id ?? "", Boolean(feedback))
  const { data: teammates = [] } = useSupportTeammates(isLead && Boolean(feedback))
  const [stage, setStage] = useState<SupportStatus | "">("")
  const [wantsNote, setWantsNote] = useState(false)
  const [note, setNote] = useState("")
  const [severity, setSeverity] = useState<FeedbackSeverity | "">("")
  const [confirmEscalate, setConfirmEscalate] = useState(false)
  const [notifyNote, setNotifyNote] = useState("")

  // Reset local state when a new item is opened.
  const [lastId, setLastId] = useState<string | null>(null)
  if (feedback && feedback.id !== lastId) {
    setLastId(feedback.id)
    setStage(feedback.supportStatus ?? "")
    setWantsNote(false)
    setNote("")
    setSeverity("")
    setNotifyNote("")
  }

  const current = feedback?.supportStatus ?? null
  const isActive = Boolean(current && SUPPORT_PROGRESSION.includes(current))
  const currentIndex = current ? SUPPORT_PROGRESSION.indexOf(current) : -1
  const nextStage = currentIndex >= 0 ? SUPPORT_PROGRESSION[currentIndex + 1] : undefined
  const canConclude = current === "investigating"
  const isStageSelectable = (s: SupportStatus) => s === current || s === nextStage
  // Leads can act on anything in the queue (they're the ones who assign it in
  // the first place); a non-lead supporter can only act on tickets assigned
  // to them — mirrors the server-side gate in FeedbackSupportService.
  const canAct = isLead || Boolean(feedback && feedback.assignedSupporterId === user?.id)
  const cannotActReason = feedback?.assignedSupporterId
    ? `Only ${feedback.assignedSupporterName ?? "the assigned supporter"} or a lead can update this ticket`
    : "Ask a lead to assign this ticket to you before updating it"
  // The true end user never sees product-team stage emails post-escalation —
  // once the product team closes it, relaying the fix is a deliberate,
  // one-time action here rather than something that happens automatically.
  const readyToNotifySubmitter =
    current === "escalated" && feedback?.status === "closed" && !feedback?.submitterNotifiedAt

  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Failed")

  const saveStage = () => {
    if (!feedback || !stage || stage === current) return
    const trimmedNote = wantsNote ? note.trim() : ""
    updateStatus.mutate(
      { id: feedback.id, supportStatus: stage, note: trimmedNote || undefined },
      {
        onError,
        onSuccess: () => {
          toast.success(
            trimmedNote
              ? "Stage updated — the submitter has been emailed your note"
              : "Stage updated — the submitter has been emailed"
          )
          setWantsNote(false)
          setNote("")
        },
      }
    )
  }

  const doResolve = () => {
    if (!feedback) return
    if (!wantsNote || !note.trim()) {
      toast.error("Check \"Add a note\" and write a message — it's required to resolve, and it's emailed to the submitter")
      return
    }
    resolve.mutate(
      { id: feedback.id, note: note.trim() },
      {
        onError,
        onSuccess: () => {
          toast.success("Marked resolved — the submitter's been emailed your note and asked to confirm")
          onOpenChange(false)
        },
      }
    )
  }

  const doEscalate = () => {
    if (!feedback || !severity) return
    escalate.mutate(
      { id: feedback.id, severity, note: note.trim() || undefined },
      {
        onError,
        onSuccess: () => {
          toast.success("Escalated — the product team has been notified")
          setConfirmEscalate(false)
          onOpenChange(false)
        },
      }
    )
  }

  const doNotifySubmitter = () => {
    if (!feedback) return
    if (!notifyNote.trim()) {
      toast.error("Add a note — it's emailed to the submitter")
      return
    }
    notifySubmitter.mutate(
      { id: feedback.id, note: notifyNote.trim() },
      {
        onError,
        onSuccess: () => {
          toast.success("Submitter notified — they've been emailed")
          setNotifyNote("")
        },
      }
    )
  }

  const onAssign = (value: string) => {
    if (!feedback) return
    assign.mutate(
      { id: feedback.id, supporterId: value === "unassigned" ? null : value },
      { onError, onSuccess: () => toast.success("Ticket assigned") }
    )
  }

  return (
    <Dialog open={Boolean(feedback)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {feedback && (
              <span className="font-mono text-sm text-muted-foreground">{feedback.ticketCode}</span>
            )}
            {feedback?.title}
            {feedback && (
              <Badge variant="outline">{FEEDBACK_TYPE_LABELS[feedback.type]}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            From {feedback?.submitterName} ({feedback?.submitterEmail}
            {feedback?.submitterPhone && <> · {feedback.submitterPhone}</>}) ·{" "}
            {feedback && new Date(feedback.createdAt).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        {feedback && (
          <div className="grid gap-6 md:grid-cols-[1.15fr_1fr]">
          <div className="min-w-0 grid gap-4 md:max-h-[65vh] md:overflow-y-auto md:pr-4">
            <p className="max-h-52 overflow-y-auto whitespace-pre-line break-words rounded-md bg-muted p-3 text-sm">
              {feedback.description}
            </p>

            {feedback.suiteName && (
              <p className="text-sm text-muted-foreground">Module: {feedback.suiteName}</p>
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

            <div className="grid gap-1.5">
              <Label>Assigned to</Label>
              {isLead ? (
                <Select
                  value={feedback.assignedSupporterId ?? "unassigned"}
                  onValueChange={onAssign}
                  disabled={assign.isPending}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {teammates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                        {t.isSupportLead ? " (Lead)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {feedback.assignedSupporterName ?? "Unassigned"}
                </p>
              )}
            </div>

            {history.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Timeline</Label>
                <div className="rounded-md border p-3">
                  <FeedbackTimeline
                    history={history}
                    stages={SUPPORT_STATUSES}
                    labels={SUPPORT_STATUS_LABELS}
                  />
                </div>
              </div>
            )}

            {!isActive && (
              <div className="rounded-md border-l-3 border-primary bg-primary/10 px-3 py-2">
                <p className="text-xs font-medium text-primary">
                  {SUPPORT_STATUS_LABELS[current ?? "logged"]}
                  {current === "escalated" && (
                    <> · product team stage: {FEEDBACK_STATUS_LABELS[feedback.status]}</>
                  )}
                </p>
                {feedback.supportResponse && (
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm">{feedback.supportResponse}</p>
                )}
              </div>
            )}

            {current === "escalated" && feedback.status === "closed" && (
              <div className="grid gap-1.5">
                {!readyToNotifySubmitter ? (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MailCheck className="size-3.5 shrink-0" />
                    You told {feedback.submitterName} this is fixed on{" "}
                    {new Date(feedback.submitterNotifiedAt as string).toLocaleDateString()}
                  </p>
                ) : (
                  <>
                    <Label htmlFor="notify-submitter-note">
                      The product team closed this — let {feedback.submitterName} know it's fixed
                    </Label>
                    <Textarea
                      id="notify-submitter-note"
                      rows={3}
                      maxLength={3000}
                      placeholder="This note is emailed to the submitter…"
                      value={notifyNote}
                      onChange={(e) => setNotifyNote(e.target.value)}
                    />
                    <Button
                      size="sm"
                      className="justify-self-start"
                      onClick={doNotifySubmitter}
                      disabled={notifySubmitter.isPending || !canAct}
                      title={canAct ? undefined : cannotActReason}
                    >
                      <MailCheck className="mr-1 size-3.5" />
                      {notifySubmitter.isPending ? "Notifying…" : "Notify submitter — it's fixed"}
                    </Button>
                  </>
                )}
              </div>
            )}

            {isActive && !canAct && (
              <p className="text-xs text-muted-foreground">{cannotActReason}</p>
            )}

            {isActive && (
              <>
                <div className="grid gap-1.5">
                  <label className="flex cursor-pointer items-start gap-2">
                    <Checkbox
                      className="mt-0.5"
                      checked={wantsNote}
                      disabled={!canAct}
                      onCheckedChange={(checked) => {
                        const next = checked === true
                        setWantsNote(next)
                        if (!next) setNote("")
                      }}
                    />
                    <span className="text-sm">
                      Add a note
                      <span className="block text-xs font-normal text-muted-foreground">
                        {canConclude
                          ? "Required to resolve — emailed straight to the submitter. Optional when escalating — stays internal for your product team, the submitter is not emailed it."
                          : "Optional — check this and write a message before hitting Save stage below to have it emailed to the submitter alongside the stage update."}
                      </span>
                    </span>
                  </label>
                  {wantsNote && (
                    <Textarea
                      id="support-note"
                      rows={3}
                      maxLength={3000}
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label>Stage (the submitter is emailed on every change)</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={stage}
                      onValueChange={(v) => setStage(v as SupportStatus)}
                      disabled={!canAct}
                    >
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUPPORT_PROGRESSION.map((s) => (
                          <SelectItem key={s} value={s} disabled={!isStageSelectable(s)}>
                            {SUPPORT_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={saveStage}
                      disabled={updateStatus.isPending || !stage || stage === current || !canAct}
                      title={canAct ? undefined : cannotActReason}
                    >
                      {updateStatus.isPending ? "Saving…" : "Save stage"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {nextStage
                      ? `Next stage: ${SUPPORT_STATUS_LABELS[nextStage]}`
                      : "Ready to resolve locally or escalate to the product team"}
                  </p>
                </div>

                {canConclude && (
                  <div className="grid gap-1.5">
                    <Label>Severity (required to escalate)</Label>
                    <Select
                      value={severity}
                      onValueChange={(v) => setSeverity(v as FeedbackSeverity)}
                      disabled={!canAct}
                    >
                      <SelectTrigger><SelectValue placeholder="Pick a severity" /></SelectTrigger>
                      <SelectContent>
                        {FEEDBACK_SEVERITIES.map((s) => (
                          <SelectItem key={s} value={s}>{FEEDBACK_SEVERITY_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Tells the product team how urgent this is — not shown to the submitter.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

            <div className="min-w-0 border-t pt-4 md:max-h-[65vh] md:overflow-y-auto md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <TicketCommentThread feedbackId={feedback.id} support />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {isActive && (
            <>
              <Button
                variant="outline"
                onClick={() => setConfirmEscalate(true)}
                disabled={escalate.isPending || !canConclude || !severity || !canAct}
                title={
                  !canAct
                    ? cannotActReason
                    : !canConclude
                      ? "Move the item to Investigating first"
                      : !severity
                        ? "Pick a severity first"
                        : undefined
                }
              >
                <ArrowUpRight className="mr-1 size-3.5" /> Escalate
              </Button>
              <Button
                onClick={doResolve}
                disabled={resolve.isPending || !canConclude || !canAct}
                title={!canAct ? cannotActReason : canConclude ? undefined : "Move the item to Investigating first"}
              >
                <CheckCircle2 className="mr-1 size-3.5" />
                {resolve.isPending ? "Resolving…" : "Resolve locally"}
              </Button>
            </>
          )}
        </DialogFooter>

        <ConfirmDialog
          open={confirmEscalate}
          onOpenChange={setConfirmEscalate}
          title="Escalate to the product team"
          description="This hands the item to the product owner's team and can't be undone. The submitter is told it's been escalated; from then on you'll receive the product team's updates by email and relay them to your user."
          confirmLabel="Escalate"
          loading={escalate.isPending}
          onConfirm={doEscalate}
        />
      </DialogContent>
    </Dialog>
  )
}

// Detail view of a queue item for IT supporters. The workflow is strictly
// sequential (Logged → Acknowledged → Investigating) — the end user is
// emailed at every stage change — and only from Investigating can the item be
// resolved locally (required note, emailed) or escalated to the product team.
import { useState } from "react"
import { ArrowUpRight, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { FeedbackTimeline } from "@/components/feedback/FeedbackTimeline"
import {
  useEscalateSupportItem,
  useResolveSupportItem,
  useSupportHistory,
  useUpdateSupportStatus,
} from "@/hooks/useFeedback"
import { ApiError } from "@/transport/http"
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  SUPPORT_PROGRESSION,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  type Feedback,
  type SupportStatus,
} from "@/types/feedback.types"

interface Props {
  feedback: Feedback | null
  onOpenChange: (open: boolean) => void
}

export function SupportItemDialog({ feedback, onOpenChange }: Props) {
  const updateStatus = useUpdateSupportStatus()
  const resolve = useResolveSupportItem()
  const escalate = useEscalateSupportItem()
  const { data: history = [] } = useSupportHistory(feedback?.id ?? "", Boolean(feedback))
  const [stage, setStage] = useState<SupportStatus | "">("")
  const [note, setNote] = useState("")
  const [confirmEscalate, setConfirmEscalate] = useState(false)

  // Reset local state when a new item is opened.
  const [lastId, setLastId] = useState<string | null>(null)
  if (feedback && feedback.id !== lastId) {
    setLastId(feedback.id)
    setStage(feedback.supportStatus ?? "")
    setNote("")
  }

  const current = feedback?.supportStatus ?? null
  const isActive = Boolean(current && SUPPORT_PROGRESSION.includes(current))
  const currentIndex = current ? SUPPORT_PROGRESSION.indexOf(current) : -1
  const nextStage = currentIndex >= 0 ? SUPPORT_PROGRESSION[currentIndex + 1] : undefined
  const canConclude = current === "investigating"
  const isStageSelectable = (s: SupportStatus) => s === current || s === nextStage

  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Failed")

  const saveStage = () => {
    if (!feedback || !stage || stage === current) return
    updateStatus.mutate(
      { id: feedback.id, supportStatus: stage },
      {
        onError,
        onSuccess: () => toast.success("Stage updated — the submitter has been emailed"),
      }
    )
  }

  const doResolve = () => {
    if (!feedback) return
    if (!note.trim()) {
      toast.error("Add a note — it's emailed to the person who reported this")
      return
    }
    resolve.mutate(
      { id: feedback.id, note: note.trim() },
      {
        onError,
        onSuccess: () => {
          toast.success("Resolved — the submitter has been emailed your note")
          onOpenChange(false)
        },
      }
    )
  }

  const doEscalate = () => {
    if (!feedback) return
    escalate.mutate(
      { id: feedback.id, note: note.trim() || undefined },
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

  return (
    <Dialog open={Boolean(feedback)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
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
          <div className="grid gap-4">
            <p className="max-h-52 overflow-y-auto whitespace-pre-line rounded-md bg-muted p-3 text-sm">
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
                  <p className="mt-0.5 whitespace-pre-line text-sm">{feedback.supportResponse}</p>
                )}
              </div>
            )}

            {isActive && (
              <>
                <div className="grid gap-1.5">
                  <Label>Stage (the submitter is emailed on every change)</Label>
                  <div className="flex items-center gap-2">
                    <Select value={stage} onValueChange={(v) => setStage(v as SupportStatus)}>
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
                      disabled={updateStatus.isPending || !stage || stage === current}
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

                <div className="grid gap-1.5">
                  <Label htmlFor="support-note">
                    Note — required to resolve (emailed to the submitter), optional when escalating
                  </Label>
                  <Textarea
                    id="support-note"
                    rows={3}
                    maxLength={3000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {isActive && (
            <>
              <Button
                variant="outline"
                onClick={() => setConfirmEscalate(true)}
                disabled={escalate.isPending || !canConclude}
                title={canConclude ? undefined : "Move the item to Investigating first"}
              >
                <ArrowUpRight className="mr-1 size-3.5" /> Escalate
              </Button>
              <Button
                onClick={doResolve}
                disabled={resolve.isPending || !canConclude}
                title={canConclude ? undefined : "Move the item to Investigating first"}
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

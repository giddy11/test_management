// pages/serviceDesk/RequestDetailPage.tsx — one IT request, for everyone
// involved. What each person can do here comes from the server's `viewer`
// block (requester, approver, IT), never from guessing on the client.
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bot, CheckCircle2, HelpCircle, Lock, Play, ShieldCheck, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormAnswers } from "@/components/serviceDesk/DynamicFormFields"
import {
  DueText,
  ModuleOffNotice,
  OverdueBadge,
  RequestPriorityBadge,
  RequestStatusBadge,
  RiskBadge,
  When,
} from "@/components/serviceDesk/RequestBits"
import { ApprovalSteps } from "@/components/serviceDesk/ApprovalSteps"
import { AiTriageCard, AutomationCard, IdentityCard, ReviewBanner } from "@/components/serviceDesk/RequestAutomationPanels"
import { Badge } from "@/components/ui/badge"
import { RequestAttachments } from "@/components/serviceDesk/RequestFiles"
import { RequestConversation } from "@/components/serviceDesk/RequestConversation"
import {
  useApproveRequest,
  useProvideInfo,
  useAssignRequest,
  useCancelRequest,
  useFulfilRequest,
  useLiveRequest,
  useRejectRequest,
  useServiceAgents,
  useServiceDeskSettings,
  useServiceRequest,
  useStartRequest,
  useSubmitRequest,
} from "@/hooks/useServiceDesk"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"
import { cn } from "@/lib/utils"
import { NEEDED_BY_WARNING_TEXT, formatNeededBy } from "@/lib/serviceDesk"
import { ApiError } from "@/transport/http"
import { STATUS_META, type RequestDetail } from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

export default function RequestDetailPage() {
  const { id } = useParams()
  const { permissions } = useAuth()
  const { data: settings, isLoading: loadingSettings } = useServiceDeskSettings()
  const { data, isLoading, error } = useServiceRequest(settings?.enabled ? id : undefined)
  useLiveRequest(settings?.enabled ? id : undefined)

  if (loadingSettings || (settings?.enabled && isLoading)) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!settings?.enabled) return <ModuleOffNotice canManage={can(permissions, "servicedesk.manage")} />
  if (error || !data) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          This request doesn't exist, or you can't see it. <Link className="underline" to="/requests/mine">My requests</Link>
        </CardContent>
      </Card>
    )
  }
  return <RequestView detail={data} />
}

function RequestView({ detail }: { detail: RequestDetail }) {
  const { request: r, viewer } = detail
  const back = viewer.isAgent && !viewer.isRequester
    ? { to: "/requests/queue", label: "IT queue" }
    : viewer.isApprover && !viewer.isRequester
      ? { to: "/requests/approvals", label: "Approvals" }
      : { to: "/requests/mine", label: "My requests" }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to={back.to}>
          <ArrowLeft className="mr-1 size-3.5" /> {back.label}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{r.reference}</p>
          <h1 className="text-2xl font-semibold break-words">{r.title}</h1>
          <p className="text-sm text-muted-foreground">
            {r.item.categoryName} · {r.item.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OverdueBadge phase={r.overdue} level={r.escalationLevel} />
          {r.autoApproved && <Badge variant="outline" className="gap-1"><Bot className="size-3" /> Approved automatically</Badge>}
          {r.riskLevel !== "low" && <RiskBadge value={r.riskLevel} />}
          <RequestPriorityBadge value={r.priority} />
          <RequestStatusBadge value={r.status} />
        </div>
      </div>

      <ReviewBanner detail={detail} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Fact label="Requested by" value={`${r.requester.name}`} />
                <Fact label="For" value={r.requestedFor ? `${r.requestedFor.name}${r.requestedFor.id ? "" : " (new starter)"}` : r.requester.name} />
                <Fact label="Submitted" value={r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "Not yet — this is a draft"} />
                <Fact label="Handled by" value={r.assignee?.name ?? (r.status === "draft" ? "—" : "Not assigned yet")} />
                {(r.status === "submitted" || r.status === "approved" || r.status === "in_progress") && r.fulfilmentDueAt && (
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Fulfilment target</dt>
                    <dd>
                      {new Date(r.fulfilmentDueAt).toLocaleString()} · <DueText at={r.fulfilmentDueAt} />
                    </dd>
                  </div>
                )}
                {r.neededBy && (
                  <div className="min-w-0" data-cy="needed-by-fact">
                    <dt className="text-xs text-muted-foreground">Needed by</dt>
                    <dd>
                      {formatNeededBy(r.neededBy.date, true)}
                      {r.neededBy.warning && (
                        <p
                          className={cn(
                            "text-xs",
                            r.neededBy.warning === "passed" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"
                          )}
                        >
                          {NEEDED_BY_WARNING_TEXT[r.neededBy.warning]}
                        </p>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              <FormAnswers fields={r.item.formSchema} values={r.formValues} />
              {r.description && <Prose label="Anything else" text={r.description} />}
              {r.businessJustification && <Prose label="Business justification" text={r.businessJustification} />}
              {r.resolutionNote && (
                <Prose
                  label={
                    r.status === "cancelled"
                      ? "Why it was cancelled"
                      : r.fulfilledBy === "automation"
                        ? "Done automatically"
                        : r.fulfilledBy === "self_service"
                          ? "Done through self-service"
                          : "What IT did"
                  }
                  text={r.resolutionNote}
                  tone={r.status === "cancelled" ? "muted" : "success"}
                />
              )}
            </CardContent>
          </Card>

          <RequestAttachments
            requestId={r.id}
            files={detail.attachments}
            canAttach={viewer.canAttach}
            canRemoveAny={viewer.isAgent}
            myUserId={viewer.myUserId}
          />

          <RequestConversation detail={detail} />
        </div>

        <div className="space-y-4">
          <Actions detail={detail} />
          <IdentityCard detail={detail} />
          <AutomationCard detail={detail} />
          <AiTriageCard detail={detail} />
          {viewer.isAgent && detail.fulfilmentNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-sm"><Lock className="size-3.5" /> How IT fulfils this</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{detail.fulfilmentNotes}</CardContent>
            </Card>
          )}
          {detail.approvals.length > 0 && <ApprovalSteps approvals={detail.approvals} request={r} />}
          <Timeline detail={detail} />
        </div>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  )
}

function Prose({ label, text, tone }: { label: string; text: string; tone?: "success" | "muted" }) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        tone === "success" && "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
        tone === "muted" && "bg-muted/50"
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
    </div>
  )
}

// ── What this person can do right now ────────────────────────────────────────
function Actions({ detail }: { detail: RequestDetail }) {
  const { request: r, viewer } = detail
  const navigate = useNavigate()
  const { user } = useAuth()
  const [comment, setComment] = useState("")
  const [note, setNote] = useState("")
  const [reason, setReason] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const { data: agents = [] } = useServiceAgents(viewer.canAssign)

  const submit = useSubmitRequest()
  const approve = useApproveRequest()
  const reject = useRejectRequest()
  const assign = useAssignRequest()
  const start = useStartRequest()
  const fulfil = useFulfilRequest()
  const cancel = useCancelRequest()

  const [answer, setAnswer] = useState("")
  const provideInfo = useProvideInfo()
  const lastQuestion = [...detail.history].reverse().find((h) => h.toStatus === "info_requested")

  const nothingToDo =
    !viewer.canEdit &&
    !viewer.canDecide &&
    !viewer.canAssign &&
    !viewer.canStart &&
    !viewer.canFulfil &&
    !viewer.canCancel &&
    !viewer.canProvideInfo

  const copy = waitingCopy(detail)

  if (nothingToDo) {
    if (!copy) return null
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">{copy}</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Next step</CardTitle>
        {copy && <CardDescription>{copy}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {viewer.canProvideInfo && (
          <div className="space-y-2 rounded-md border border-yellow-300 bg-yellow-50/70 p-3 dark:border-yellow-900 dark:bg-yellow-950/30">
            <p className="flex items-center gap-1.5 text-sm font-medium"><HelpCircle className="size-4" /> {lastQuestion?.actorName ?? "IT"} asked</p>
            {lastQuestion?.note && <p className="text-sm whitespace-pre-wrap">{lastQuestion.note}</p>}
            <Textarea rows={3} placeholder="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} data-cy="provide-info" />
            <Button
              size="sm"
              disabled={!answer.trim() || provideInfo.isPending}
              onClick={() =>
                provideInfo.mutate(
                  { id: r.id, answer: answer.trim() },
                  { onSuccess: () => { toast.success("Answer sent — the request is moving again"); setAnswer("") }, onError: fail }
                )
              }
            >
              Send answer
            </Button>
          </div>
        )}

        {viewer.canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate(`/requests/${r.id}/edit`)}>
              Continue editing
            </Button>
            <Button
              size="sm"
              disabled={submit.isPending}
              onClick={() =>
                submit.mutate(r.id, {
                  onSuccess: () => toast.success("Request submitted"),
                  onError: (e) => {
                    fail(e)
                    navigate(`/requests/${r.id}/edit`)
                  },
                })
              }
            >
              Submit
            </Button>
          </div>
        )}

        {viewer.canDecide && (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="flex items-center gap-1.5 text-sm font-medium"><ShieldCheck className="size-4" /> Your approval is needed</p>
            <Textarea
              rows={3}
              placeholder="Comment (required to reject)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              data-cy="approval-comment"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={approve.isPending || reject.isPending}
                onClick={() =>
                  approve.mutate({ id: r.id, comment: comment.trim() || null }, { onSuccess: () => toast.success("Approved — it's with IT now"), onError: fail })
                }
                data-cy="approve-request"
              >
                <CheckCircle2 className="mr-1 size-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={approve.isPending || reject.isPending}
                onClick={() => {
                  if (!comment.trim()) return toast.error("Say why you're rejecting it")
                  reject.mutate({ id: r.id, comment: comment.trim() }, { onSuccess: () => toast.success("Rejected"), onError: fail })
                }}
                data-cy="reject-request"
              >
                <XCircle className="mr-1 size-3.5" /> Reject
              </Button>
            </div>
          </div>
        )}

        {viewer.canAssign && (
          <div className="grid gap-1.5">
            <Label>Handled by</Label>
            <div className="flex gap-2">
              <Select
                value={r.assignee?.id ?? "none"}
                onValueChange={(v) =>
                  assign.mutate({ id: r.id, assigneeId: v === "none" ? null : v }, { onSuccess: () => toast.success("Assigned"), onError: fail })
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not assigned</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {r.assignee?.id !== user?.id && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={assign.isPending}
                  onClick={() => assign.mutate({ id: r.id, assigneeId: user?.id ?? null }, { onSuccess: () => toast.success("It's yours"), onError: fail })}
                >
                  Take it
                </Button>
              )}
            </div>
          </div>
        )}

        {viewer.canStart && (
          <Button
            size="sm"
            className="w-full"
            disabled={start.isPending || viewer.needsIdentityCheck}
            onClick={() => start.mutate(r.id, { onSuccess: () => toast.success("Started — the requester has been told"), onError: fail })}
            data-cy="start-request"
          >
            <Play className="mr-1 size-3.5" /> {r.item.fulfilmentType === "webhook" ? "Do it manually instead" : "Start work"}
          </Button>
        )}
        {viewer.canStart && viewer.needsIdentityCheck && (
          <p className="text-xs text-amber-700 dark:text-amber-400">Record the identity check first (see Identity check).</p>
        )}

        {viewer.canFulfil && (
          <div className="space-y-2">
            <Label htmlFor="fulfil-note">What was done</Label>
            <Textarea
              id="fulfil-note"
              rows={3}
              placeholder="e.g. Licence assigned to your account; sign out and back in to Adobe."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              size="sm"
              className="w-full"
              disabled={fulfil.isPending}
              onClick={() => {
                if (!note.trim()) return toast.error("Say what was done")
                fulfil.mutate({ id: r.id, note: note.trim() }, { onSuccess: () => toast.success("Marked fulfilled"), onError: fail })
              }}
              data-cy="fulfil-request"
            >
              <CheckCircle2 className="mr-1 size-3.5" /> Mark fulfilled
            </Button>
          </div>
        )}

        {viewer.canCancel &&
          (cancelling ? (
            <div className="space-y-2 border-t pt-3">
              <Label htmlFor="cancel-reason">{viewer.cancelNeedsReason ? "Why is it being cancelled?" : "Reason (optional)"}</Label>
              <Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (viewer.cancelNeedsReason && !reason.trim()) return toast.error("Say why it's being cancelled")
                    cancel.mutate(
                      { id: r.id, reason: reason.trim() || null },
                      {
                        onSuccess: () => {
                          toast.success(r.status === "draft" ? "Draft discarded" : "Request cancelled")
                          setCancelling(false)
                        },
                        onError: fail,
                      }
                    )
                  }}
                >
                  {r.status === "draft" ? "Discard draft" : "Cancel request"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>Keep it</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="w-full text-muted-foreground" onClick={() => setCancelling(true)}>
              {r.status === "draft" ? "Discard draft" : "Cancel request"}
            </Button>
          ))}
      </CardContent>
    </Card>
  )
}

// What the Next step card says about who has the ball. null = nothing to add.
function waitingCopy({ request: r, viewer, approvals }: RequestDetail): string | null {
  switch (r.status) {
    case "draft":
      return "Only you can see this draft. Submit it when it's ready."
    case "pending_approval": {
      const step = approvals.find((a) => a.stepOrder === (r.currentStep ?? 1))?.stepName
      return viewer.canDecide
        ? "Approve it to move it on, or reject it with a reason. Ask the requester anything in the conversation."
        : `Waiting for approval${step ? ` — ${step}` : ""}.`
    }
    case "info_requested":
      // For everyone else the question is already in the conversation, and the
      // status badge says the request is waiting for information.
      return viewer.canProvideInfo ? "A question is waiting for your answer. The request is on hold until you reply." : null
    case "submitted":
    case "approved":
      return viewer.isAgent ? "Ready for IT to pick up." : "With IT — waiting for someone to pick it up."
    case "in_progress":
      return viewer.isAgent ? "Being worked on. Mark it fulfilled when it's done." : `${r.assignee?.name ?? "IT"} is working on it.`
    case "fulfilled":
      return "Done."
    case "rejected":
      return "This request was rejected."
    case "cancelled":
      return "This request was cancelled."
  }
}

// ── History ──────────────────────────────────────────────────────────────────
function Timeline({ detail }: { detail: RequestDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">History</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3 border-l pl-4">
          {detail.history.map((h) => (
            <li key={h.id} className="relative text-sm">
              <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-primary" />
              <p>
                <span className="font-medium">{STATUS_META[h.toStatus]?.label ?? h.toStatus}</span>
                {h.actorName && <span className="text-muted-foreground"> · {h.actorName}</span>}
              </p>
              <p className="text-xs text-muted-foreground"><When at={h.createdAt} /></p>
              {h.note && <p className="mt-0.5 text-xs whitespace-pre-wrap text-muted-foreground">{h.note}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

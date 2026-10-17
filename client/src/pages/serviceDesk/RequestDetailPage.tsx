// pages/serviceDesk/RequestDetailPage.tsx — one IT request, for everyone
// involved. What each person can do here comes from the server's `viewer`
// block (requester, approver, IT), never from guessing on the client.
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, CheckCircle2, HelpCircle, Lock, MessageSquare, Play, ShieldCheck, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
import { RequestAttachments } from "@/components/serviceDesk/RequestFiles"
import {
  useApproveRequest,
  useAskForInfo,
  useProvideInfo,
  useAssignRequest,
  useCancelRequest,
  useCommentOnRequest,
  useFulfilRequest,
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
import { ApiError } from "@/transport/http"
import { STATUS_META, type RequestDetail } from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

export default function RequestDetailPage() {
  const { id } = useParams()
  const { permissions } = useAuth()
  const { data: settings, isLoading: loadingSettings } = useServiceDeskSettings()
  const { data, isLoading, error } = useServiceRequest(settings?.enabled ? id : undefined)

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
          {r.riskLevel !== "low" && <RiskBadge value={r.riskLevel} />}
          <RequestPriorityBadge value={r.priority} />
          <RequestStatusBadge value={r.status} />
        </div>
      </div>

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
              </dl>
              <FormAnswers fields={r.item.formSchema} values={r.formValues} />
              {r.description && <Prose label="Anything else" text={r.description} />}
              {r.businessJustification && <Prose label="Business justification" text={r.businessJustification} />}
              {r.resolutionNote && (
                <Prose
                  label={r.status === "cancelled" ? "Why it was cancelled" : "What IT did"}
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

          <Conversation detail={detail} />
        </div>

        <div className="space-y-4">
          <Actions detail={detail} />
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

  const [question, setQuestion] = useState("")
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState("")
  const askInfo = useAskForInfo()
  const provideInfo = useProvideInfo()
  const lastQuestion = [...detail.history].reverse().find((h) => h.toStatus === "info_requested")

  const nothingToDo =
    !viewer.canEdit &&
    !viewer.canDecide &&
    !viewer.canAssign &&
    !viewer.canStart &&
    !viewer.canFulfil &&
    !viewer.canCancel &&
    !viewer.canAskInfo &&
    !viewer.canProvideInfo

  if (nothingToDo) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">{waitingCopy(detail)}</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Next step</CardTitle>
        <CardDescription>{waitingCopy(detail)}</CardDescription>
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

        {viewer.canAskInfo &&
          (asking ? (
            <div className="space-y-2">
              <Label htmlFor="ask-info">What do you need to know?</Label>
              <Textarea
                id="ask-info"
                rows={3}
                placeholder="The request pauses (and its clock stops) until the requester answers."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!question.trim() || askInfo.isPending}
                  onClick={() =>
                    askInfo.mutate(
                      { id: r.id, question: question.trim() },
                      {
                        onSuccess: () => {
                          toast.success("Question sent")
                          setQuestion("")
                          setAsking(false)
                        },
                        onError: fail,
                      }
                    )
                  }
                >
                  Send question
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Never mind</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full" onClick={() => setAsking(true)} data-cy="ask-info">
              <HelpCircle className="mr-1 size-3.5" /> Ask the requester a question
            </Button>
          ))}

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
            disabled={start.isPending}
            onClick={() => start.mutate(r.id, { onSuccess: () => toast.success("Started — the requester has been told"), onError: fail })}
            data-cy="start-request"
          >
            <Play className="mr-1 size-3.5" /> Start work
          </Button>
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

function waitingCopy({ request: r, viewer, approvals }: RequestDetail): string {
  switch (r.status) {
    case "draft":
      return "Only you can see this draft. Submit it when it's ready."
    case "pending_approval": {
      const step = approvals.find((a) => a.stepOrder === (r.currentStep ?? 1))?.stepName
      return viewer.canDecide
        ? "Approve it to move it on, reject it with a reason, or ask the requester a question."
        : `Waiting for approval${step ? ` — ${step}` : ""}.`
    }
    case "info_requested":
      return viewer.canProvideInfo
        ? "A question is waiting for your answer. The request is on hold until you reply."
        : "Waiting for the requester to answer a question."
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

// ── Conversation ─────────────────────────────────────────────────────────────
function Conversation({ detail }: { detail: RequestDetail }) {
  const { request: r, viewer, comments } = detail
  const [body, setBody] = useState("")
  const [internal, setInternal] = useState(false)
  const post = useCommentOnRequest()

  if (r.status === "draft") return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base"><MessageSquare className="size-4" /> Conversation</CardTitle>
        <CardDescription>Everyone on this request can see comments. Internal notes are IT-only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
        {comments.map((c) => (
          <div
            key={c.id}
            className={cn("rounded-md border p-3", c.isInternal && "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30")}
          >
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{c.authorName ?? "Someone"}</span> · <When at={c.createdAt} />
              {c.isInternal && <span className="ml-1 inline-flex items-center gap-0.5"><Lock className="size-3" /> internal</span>}
            </p>
            <p className="mt-1 text-sm whitespace-pre-wrap break-words">{c.body}</p>
          </div>
        ))}

        {viewer.canComment && (
          <div className="space-y-2 border-t pt-3">
            <Textarea rows={3} placeholder="Write a message…" value={body} onChange={(e) => setBody(e.target.value)} data-cy="request-comment" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {viewer.canAddInternalNote ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={internal} onCheckedChange={(v) => setInternal(v === true)} />
                  Internal note (IT only)
                </label>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                disabled={!body.trim() || post.isPending}
                onClick={() =>
                  post.mutate(
                    { id: r.id, body: body.trim(), internal },
                    {
                      onSuccess: () => {
                        setBody("")
                        setInternal(false)
                      },
                      onError: fail,
                    }
                  )
                }
              >
                {internal ? "Add note" : "Send"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

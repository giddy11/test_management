// components/serviceDesk/RequestAutomationPanels.tsx — the Phase 3 parts of a
// request page:
//   ReviewBanner     flagged for review (IT sees why) — clear the flag
//   AutomationCard   what automation did, and run / retry / take over (IT)
//   IdentityCard     record how IT confirmed who is asking (IT)
//   AiTriageCard     the advisory AI read for approvers and IT
// What each person may do comes from the server's `viewer` block.
import { useState } from "react"
import { Bot, Fingerprint, Flag, Hand, Play, RotateCw, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RunStatusBadge } from "@/components/serviceDesk/AutomationBits"
import { describeRun } from "@/lib/serviceDesk"
import { When } from "@/components/serviceDesk/RequestBits"
import {
  useAiTriage,
  useClearReview,
  useRecordIdentityCheck,
  useRunAutomation,
  useTakeOver,
} from "@/hooks/useServiceDesk"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"
import { ApiError } from "@/transport/http"
import { PRIORITY_META, type RequestDetail } from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

export function ReviewBanner({ detail }: { detail: RequestDetail }) {
  const { request: r, viewer } = detail
  const clear = useClearReview()
  if (!r.needsReview || r.status === "fulfilled" || r.status === "cancelled" || r.status === "rejected") return null
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-orange-300 bg-orange-50/70 p-3 dark:border-orange-900 dark:bg-orange-950/30">
      <div className="flex items-start gap-2 text-sm">
        <Flag className="mt-0.5 size-4 text-orange-600" />
        <div>
          <p className="font-medium">Needs review</p>
          <p className="text-muted-foreground">
            {viewer.isAgent && r.reviewReason ? r.reviewReason : "IT is taking a closer look before this goes any further."}
          </p>
        </div>
      </div>
      {viewer.canClearReview && (
        <Button
          size="sm"
          variant="outline"
          disabled={clear.isPending}
          onClick={() => clear.mutate(r.id, { onSuccess: () => toast.success("Reviewed — the flag is cleared"), onError: fail })}
        >
          Mark as reviewed
        </Button>
      )}
    </div>
  )
}

export function AutomationCard({ detail }: { detail: RequestDetail }) {
  const { request: r, viewer, automationRuns } = detail
  const run = useRunAutomation()
  const takeOver = useTakeOver()
  const webhook = r.item.fulfilmentType === "webhook"
  if (!viewer.isAgent || (!automationRuns.length && !webhook && !r.autoApproved)) return null

  const status =
    r.automationStatus === "running"
      ? { label: "Connector working on it", tone: "text-sky-700 dark:text-sky-300" }
      : r.automationStatus === "failed"
        ? { label: "Automation failed", tone: "text-red-700 dark:text-red-300" }
        : r.automationStatus === "manual"
          ? { label: "Handled by a person", tone: "text-muted-foreground" }
          : r.automationStatus === "succeeded"
            ? { label: "Fulfilled automatically", tone: "text-emerald-700 dark:text-emerald-300" }
            : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm"><Bot className="size-4" /> Automation</CardTitle>
        {status && <CardDescription className={status.tone}>{status.label}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {automationRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing automated has run yet.</p>
        ) : (
          <ul className="space-y-2">
            {automationRuns.map((x) => (
              <li key={x.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <RunStatusBadge status={x.status} />
                  <span className="text-xs text-muted-foreground"><When at={x.startedAt} /></span>
                </div>
                <p className="mt-0.5 text-xs">{describeRun(x)}</p>
                {x.status === "retrying" && x.nextAttemptAt && (
                  <p className="text-xs text-muted-foreground">Next try <When at={x.nextAttemptAt} /></p>
                )}
              </li>
            ))}
          </ul>
        )}
        {(viewer.canRunAutomation || viewer.canTakeOver) && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {viewer.canRunAutomation && (
              <Button
                size="sm"
                disabled={run.isPending || viewer.needsIdentityCheck}
                title={viewer.needsIdentityCheck ? "Record the identity check first" : undefined}
                onClick={() => run.mutate(r.id, { onSuccess: () => toast.success("Sent to the connector"), onError: fail })}
              >
                {r.automationStatus === "failed" ? <RotateCw className="mr-1 size-3.5" /> : <Play className="mr-1 size-3.5" />}
                {r.automationStatus === "failed" ? "Retry" : "Run automation"}
              </Button>
            )}
            {viewer.canTakeOver && (
              <Button
                size="sm"
                variant="outline"
                disabled={takeOver.isPending}
                onClick={() => takeOver.mutate(r.id, { onSuccess: () => toast.success("It's yours — automation has stopped"), onError: fail })}
              >
                <Hand className="mr-1 size-3.5" /> Handle it manually
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const METHODS = [
  "Call-back to their known phone number",
  "Confirmed by their line manager",
  "Video call with photo ID",
  "In person with photo ID",
  "Verified through the identity provider",
  "Other",
]

export function IdentityCard({ detail }: { detail: RequestDetail }) {
  const { request: r, viewer, identityCheck } = detail
  const record = useRecordIdentityCheck()
  const [method, setMethod] = useState("")
  const [note, setNote] = useState("")
  if (!viewer.isAgent || !r.item.requiresIdentityCheck) return null

  return (
    <Card className={viewer.needsIdentityCheck ? "border-amber-300 dark:border-amber-900" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm"><Fingerprint className="size-4" /> Identity check</CardTitle>
        <CardDescription>
          {identityCheck
            ? `Confirmed by ${identityCheck.verifiedByName ?? "IT"}`
            : "Confirm who is asking before any work starts. Never send a new password in the request."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {identityCheck ? (
          <>
            <p><span className="text-muted-foreground">How:</span> {identityCheck.method}</p>
            {identityCheck.note && <p className="whitespace-pre-wrap text-muted-foreground">{identityCheck.note}</p>}
            <p className="text-xs text-muted-foreground"><When at={identityCheck.verifiedAt} /></p>
          </>
        ) : viewer.canRecordIdentity ? (
          <>
            <div className="grid gap-1.5">
              <Label>How did you confirm it?</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Textarea rows={2} placeholder="Note (IT only, optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button
              size="sm"
              disabled={!method || record.isPending}
              onClick={() =>
                record.mutate(
                  { id: r.id, method, note: note.trim() || null },
                  { onSuccess: () => { toast.success("Identity check recorded"); setMethod(""); setNote("") }, onError: fail }
                )
              }
            >
              Record identity check
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">Not recorded.</p>
        )}
      </CardContent>
    </Card>
  )
}

const SUGGESTION_LABEL = {
  approve: "Leans towards approving",
  reject: "Leans towards rejecting",
  ask_for_info: "Suggests asking for more information",
  no_view: "No clear view",
} as const

export function AiTriageCard({ detail }: { detail: RequestDetail }) {
  const { request: r, viewer, aiTriage } = detail
  const { permissions } = useAuth()
  const triage = useAiTriage()
  if (!viewer.canAiTriage || (!aiTriage && !can(permissions, "ai.use"))) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm"><Sparkles className="size-4" /> AI triage</CardTitle>
        <CardDescription>Advice only — it never approves, rejects or changes anything.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {aiTriage ? (
          <>
            <p className="whitespace-pre-wrap">{aiTriage.summary}</p>
            <div>
              <Badge variant="outline">{SUGGESTION_LABEL[aiTriage.suggestion]}</Badge>
              {aiTriage.suggestionReason && <p className="mt-1 text-xs text-muted-foreground">{aiTriage.suggestionReason}</p>}
            </div>
            {aiTriage.riskNotes.length > 0 && (
              <div>
                <p className="text-xs font-medium">Worth weighing</p>
                <ul className="list-disc pl-4 text-xs text-muted-foreground">{aiTriage.riskNotes.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {aiTriage.missingInfo.length > 0 && (
              <div>
                <p className="text-xs font-medium">Could ask the requester</p>
                <ul className="list-disc pl-4 text-xs text-muted-foreground">{aiTriage.missingInfo.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {aiTriage.suggestedPriority && aiTriage.suggestedPriority !== r.priority && (
              <p className="text-xs text-muted-foreground">Suggested priority: {PRIORITY_META[aiTriage.suggestedPriority].label}</p>
            )}
            <p className="text-xs text-muted-foreground">
              By {aiTriage.generatedByName} · <When at={aiTriage.generatedAt} /> · {aiTriage.model}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">A summary, risks to weigh, and what might be missing.</p>
        )}
        {can(permissions, "ai.use") && (
          <Button
            size="sm"
            variant="outline"
            disabled={triage.isPending}
            onClick={() => triage.mutate(r.id, { onSuccess: () => toast.success("Triage ready"), onError: fail })}
          >
            <Sparkles className="mr-1 size-3.5" /> {triage.isPending ? "Reading the request…" : aiTriage ? "Refresh" : "Get AI triage"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

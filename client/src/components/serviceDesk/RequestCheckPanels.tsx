// components/serviceDesk/RequestCheckPanels.tsx — two cards on a request page:
//   IdentityCard     record how IT confirmed who is asking (IT)
//   AiTriageCard     the advisory AI read for approvers and IT
// What each person may do comes from the server's `viewer` block.
import { useState } from "react"
import { Fingerprint, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { When } from "@/components/serviceDesk/RequestBits"
import { useAiTriage, useRecordIdentityCheck } from "@/hooks/useServiceDesk"
import { useAuth } from "@/contexts/AuthContext"
import { can } from "@/lib/can"
import { ApiError } from "@/transport/http"
import { PRIORITY_META, type RequestDetail } from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

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

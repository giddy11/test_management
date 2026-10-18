// components/serviceDesk/ApprovalSteps.tsx — a request's approval route:
// each step in order, whether it needs any one or all of its approvers, and
// where every approver stands (waiting, deciding, approved, rejected, not
// needed). Delegates and fallback approvers are labelled as such.
import { CheckCircle2, CircleDashed, Clock, MinusCircle, XCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DueText, When } from "@/components/serviceDesk/RequestBits"
import { cn } from "@/lib/utils"
import type { RequestApproval, ServiceRequest } from "@/types/serviceDesk.types"

function stepStatus(rows: RequestApproval[]): "waiting" | "live" | "approved" | "rejected" | "skipped" {
  if (rows.some((r) => r.decision === "rejected")) return "rejected"
  if (rows.some((r) => r.decision === "pending")) return "live"
  if (rows.every((r) => r.decision === "waiting")) return "waiting"
  if (rows.some((r) => r.decision === "approved")) return "approved"
  return "skipped"
}

const STEP_LABEL = {
  waiting: "Not started",
  live: "Waiting for a decision",
  approved: "Approved",
  rejected: "Rejected",
  skipped: "Not needed",
} as const

export function ApprovalSteps({ approvals, request }: { approvals: RequestApproval[]; request: ServiceRequest }) {
  const steps = [...new Set(approvals.map((a) => a.stepOrder))].sort((a, b) => a - b)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Approval</CardTitle>
        <CardDescription>
          {request.item.approvalPolicyName ? `${request.item.approvalPolicyName} · ` : ""}
          {steps.length === 1 ? "One step" : `${steps.length} steps, in order`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((order) => {
          const rows = approvals.filter((a) => a.stepOrder === order)
          const status = stepStatus(rows)
          const mode = rows[0]?.stepMode ?? "any"
          return (
            <div key={order} className={cn("space-y-2", status === "waiting" && "opacity-60")}>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p className="text-sm font-medium">
                  {order}. {rows[0]?.stepName ?? `Step ${order}`}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    status === "approved" && "border-emerald-300 text-emerald-700 dark:text-emerald-400",
                    status === "rejected" && "border-red-300 text-red-700 dark:text-red-400",
                    status === "live" && "border-amber-300 text-amber-700 dark:text-amber-400"
                  )}
                >
                  {STEP_LABEL[status]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "order"
                  ? "They approve one after another, in the order below"
                  : mode === "all"
                    ? "Each one of these must approve"
                    : "Any one of these can decide"}
                {status === "live" && request.approvalDueAt && (
                  <> · <DueText at={request.approvalDueAt} /></>
                )}
              </p>
              <ul className="space-y-1.5">
                {rows.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <DecisionIcon decision={a.decision} />
                    <div className="min-w-0">
                      <p>
                        {mode === "order" && <span className="text-xs text-muted-foreground">{a.ruleIndex + 1}. </span>}
                        {a.approverName}
                        {a.groupName && <span className="text-xs text-muted-foreground"> · {a.groupName}</span>}
                        {a.isFallback && <span className="text-xs text-muted-foreground"> · stand-in approver</span>}
                        {a.onBehalfOfName && <span className="text-xs text-muted-foreground"> · for {a.onBehalfOfName}</span>}
                      </p>
                      {(a.decision === "approved" || a.decision === "rejected") && (
                        <p className="text-xs text-muted-foreground">
                          {a.decision === "approved" ? "Approved" : "Rejected"}
                          {a.decidedByName && a.decidedById !== a.approverId && <> by {a.decidedByName} (stand-in)</>}
                          {a.decidedAt && <> · <When at={a.decidedAt} /></>}
                        </p>
                      )}
                      {a.decision === "waiting" && status === "live" && (
                        <p className="text-xs text-muted-foreground">Waiting for their turn</p>
                      )}
                      {a.comment && <p className="text-xs whitespace-pre-wrap text-muted-foreground">“{a.comment}”</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function DecisionIcon({ decision }: { decision: RequestApproval["decision"] }) {
  if (decision === "approved") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
  if (decision === "rejected") return <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
  if (decision === "pending") return <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" />
  if (decision === "skipped") return <MinusCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
  return <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
}

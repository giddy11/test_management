import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  PRIORITY_BADGE,
  STATUS_BADGE,
  RESULT_META,
  FEATURE_REQUEST_STATUS_META,
  BUG_SEVERITY_BADGE,
  BUG_PRIORITY_BADGE,
  BUG_STATUS_META,
  AUDIT_SEVERITY_META,
  type AuditSeverity,
  type TcPriority,
  type TcStatus,
  type ResultStatus,
  type FeatureRequestStatus,
  type BugSeverity,
  type BugPriority,
  type BugStatus,
} from "@/lib/enums"

export function PriorityBadge({ value }: { value: TcPriority }) {
  return <Badge className={cn("border-transparent", PRIORITY_BADGE[value])}>{value}</Badge>
}

export function CaseStatusBadge({ value }: { value: TcStatus }) {
  return <Badge className={cn("border-transparent", STATUS_BADGE[value])}>{value}</Badge>
}

export function ResultBadge({ value }: { value: ResultStatus | null }) {
  const meta = RESULT_META[value ?? "pending"]
  return <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
}

export function FeatureRequestStatusBadge({ value }: { value: FeatureRequestStatus }) {
  const meta = FEATURE_REQUEST_STATUS_META[value]
  return <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
}

export function BugSeverityBadge({ value }: { value: BugSeverity }) {
  return <Badge className={cn("border-transparent", BUG_SEVERITY_BADGE[value])}>{value}</Badge>
}

export function BugPriorityBadge({ value }: { value: BugPriority }) {
  return <Badge className={cn("border-transparent", BUG_PRIORITY_BADGE[value])}>{value}</Badge>
}

export function BugStatusBadge({ value }: { value: BugStatus }) {
  const meta = BUG_STATUS_META[value]
  return <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
}

// Activity log entries. `info` is deliberately the quietest badge on the page —
// most of the log is routine, and the point is that warning and critical stand out.
export function AuditSeverityBadge({ value }: { value: AuditSeverity }) {
  const meta = AUDIT_SEVERITY_META[value] ?? AUDIT_SEVERITY_META.info
  return <Badge className={cn("border-transparent", meta.badge)}>{meta.label}</Badge>
}

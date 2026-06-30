import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  PRIORITY_BADGE,
  STATUS_BADGE,
  RESULT_META,
  type TcPriority,
  type TcStatus,
  type ResultStatus,
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

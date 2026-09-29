import { Bug, Lightbulb, MessageSquareHeart } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { BugStatusBadge, FeatureRequestStatusBadge } from "@/components/shared/StatusBadge"
import {
  BUG_STATUS_META,
  FEATURE_REQUEST_STATUS_META,
  type BugStatus,
  type FeatureRequestStatus,
} from "@/lib/enums"
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@/types/feedback.types"
import { TICKET_TYPE_LABELS } from "@/lib/ticketLinks"
import { cn } from "@/lib/utils"
import type { TicketType } from "@/types/ticketLink.types"

// A linked ticket's status in the same colours its own list uses — each kind of
// ticket has a different set of statuses, so the badge is chosen by type.
export function TicketStatusBadge({ type, status }: { type: TicketType; status: string }) {
  if (type === "bug" && status in BUG_STATUS_META) {
    return <BugStatusBadge value={status as BugStatus} />
  }
  if (type === "feature_request" && status in FEATURE_REQUEST_STATUS_META) {
    return <FeatureRequestStatusBadge value={status as FeatureRequestStatus} />
  }
  if (type === "feedback" && status in FEEDBACK_STATUS_LABELS) {
    return <Badge variant="outline">{FEEDBACK_STATUS_LABELS[status as FeedbackStatus]}</Badge>
  }
  return <Badge variant="outline">{status}</Badge>
}

const ICONS = { bug: Bug, feature_request: Lightbulb, feedback: MessageSquareHeart } as const

// Tells the three kinds of ticket apart at a glance in a mixed list.
export function TicketTypeIcon({ type, className }: { type: TicketType; className?: string }) {
  const Icon = ICONS[type]
  return (
    <span title={TICKET_TYPE_LABELS[type]} className="inline-flex">
      <Icon aria-label={TICKET_TYPE_LABELS[type]} className={cn("size-3.5 shrink-0", className)} />
    </span>
  )
}

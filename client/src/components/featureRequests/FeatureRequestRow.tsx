import { memo } from "react"
import { useNavigate } from "react-router-dom"
import { MessageSquare } from "lucide-react"
import { TableCell, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PresenceDot } from "@/components/shared/PresenceDot"
import { FeatureRequestStatusBadge } from "@/components/shared/StatusBadge"
import { VoteButton } from "@/components/featureRequests/VoteButton"
import { RepeatBadges } from "@/components/tickets/RepeatBadges"
import type { FeatureRequest } from "@/types/featureRequest.types"
import type { TicketLinkSummary } from "@/types/ticketLink.types"

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()

export const FeatureRequestRow = memo(function FeatureRequestRow({
  request,
  links,
}: {
  request: FeatureRequest
  links?: TicketLinkSummary
}) {
  const navigate = useNavigate()

  return (
    <TableRow
      data-cy="feature-request-card"
      className="cursor-pointer"
      onClick={() => navigate(`/projects/${request.projectId}/feature-requests/${request.id}`)}
    >
      {/* The vote control owns its own click, so the cell must not navigate. */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <VoteButton requestId={request.id} upvoteCount={request.upvoteCount} hasVoted={request.hasVoted} compact />
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{request.referenceCode}</TableCell>
      <TableCell className="max-w-sm whitespace-normal">
        <p className="font-medium leading-snug">{request.title}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{request.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1 empty:hidden">
          <RepeatBadges summary={links} />
        </div>
      </TableCell>
      <TableCell><FeatureRequestStatusBadge value={request.status} /></TableCell>
      <TableCell>
        {request.category || request.module ? (
          <div className="flex flex-wrap gap-1">
            {request.category && <Badge variant="outline">{request.category}</Badge>}
            {request.module && <Badge variant="outline" className="text-muted-foreground">{request.module}</Badge>}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{request.submittedBy?.name ?? "—"}</TableCell>
      <TableCell>
        {request.assignedTo ? (
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <Avatar className="size-6">
                <AvatarFallback className="text-[10px]">{initials(request.assignedTo.name)}</AvatarFallback>
              </Avatar>
              <PresenceDot userId={request.assignedTo.id} className="absolute -bottom-0.5 -right-0.5 size-2" />
            </div>
            <span className="text-sm">{request.assignedTo.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <span className="flex items-center gap-1 tabular-nums">
          <MessageSquare className="size-3" /> {request.commentCount}
        </span>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {new Date(request.createdAt).toLocaleDateString()}
      </TableCell>
    </TableRow>
  )
})

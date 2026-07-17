import { memo } from "react"
import { useNavigate } from "react-router-dom"
import { MessageSquare } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FeatureRequestStatusBadge } from "@/components/shared/StatusBadge"
import { VoteButton } from "@/components/featureRequests/VoteButton"
import type { FeatureRequest } from "@/types/featureRequest.types"

export const FeatureRequestCard = memo(function FeatureRequestCard({ request }: { request: FeatureRequest }) {
  const navigate = useNavigate()

  return (
    <Card
      data-cy="feature-request-card"
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => navigate(`/projects/${request.projectId}/feature-requests/${request.id}`)}
    >
      <CardContent className="flex items-start gap-4 py-4">
        <VoteButton requestId={request.id} upvoteCount={request.upvoteCount} hasVoted={request.hasVoted} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <CardHeader className="p-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{request.referenceCode}</span>
              <CardTitle className="text-base">{request.title}</CardTitle>
              <FeatureRequestStatusBadge value={request.status} />
              {request.category && <Badge variant="outline">{request.category}</Badge>}
              {request.module && <Badge variant="outline" className="text-muted-foreground">{request.module}</Badge>}
            </div>
            <CardDescription className="line-clamp-2">{request.description}</CardDescription>
          </CardHeader>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {request.submittedBy && <span>by {request.submittedBy.name}</span>}
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" /> {request.commentCount}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

import { memo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PresenceDot } from "@/components/shared/PresenceDot"
import { BugSeverityBadge, BugPriorityBadge, BugStatusBadge } from "@/components/shared/StatusBadge"
import type { Bug } from "@/types/bug.types"

export const BugCard = memo(function BugCard({ bug }: { bug: Bug }) {
  const navigate = useNavigate()
  const initials = bug.assignedTo
    ? bug.assignedTo.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : null

  return (
    <Card
      data-cy="bug-card"
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => navigate(`/projects/${bug.projectId}/bugs/${bug.id}`)}
    >
      <CardContent className="flex items-start gap-4 py-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <CardHeader className="p-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{bug.referenceCode}</span>
              <CardTitle className="text-base">{bug.title}</CardTitle>
              <BugStatusBadge value={bug.status} />
              <BugSeverityBadge value={bug.severity} />
              <BugPriorityBadge value={bug.priority} />
            </div>
            <CardDescription className="line-clamp-2">{bug.description}</CardDescription>
          </CardHeader>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {bug.reportedBy && <span>reported by {bug.reportedBy.name}</span>}
            <span>{new Date(bug.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        {bug.assignedTo && (
          <div className="relative shrink-0" title={`Assigned to ${bug.assignedTo.name}`}>
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <PresenceDot userId={bug.assignedTo.id} className="absolute -bottom-0.5 -right-0.5" />
          </div>
        )}
      </CardContent>
    </Card>
  )
})

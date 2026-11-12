import { memo } from "react"
import { useNavigate } from "react-router-dom"
import { TableCell, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PresenceDot } from "@/components/shared/PresenceDot"
import { BugSeverityBadge, BugPriorityBadge, BugStatusBadge } from "@/components/shared/StatusBadge"
import { FixOrderInput } from "@/components/bugs/FixOrderInput"
import { RepeatBadges } from "@/components/tickets/RepeatBadges"
import { cn } from "@/lib/utils"
import type { Bug } from "@/types/bug.types"
import type { TicketLinkSummary } from "@/types/ticketLink.types"

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()

export const BugRow = memo(function BugRow({
  bug,
  links,
  canManage,
}: {
  bug: Bug
  links?: TicketLinkSummary
  canManage: boolean
}) {
  const navigate = useNavigate()

  return (
    <TableRow
      data-cy="bug-card"
      className={cn(
        "cursor-pointer border-l-2 border-l-transparent",
        bug.fixOrder != null && "border-l-primary bg-primary/5 hover:bg-primary/10"
      )}
      onClick={() => navigate(`/projects/${bug.projectId}/bugs/${bug.id}`)}
    >
      {/* The fix-order input owns its own click/typing, so the cell must not navigate. */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <FixOrderInput bugId={bug.id} fixOrder={bug.fixOrder} canManage={canManage} />
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{bug.referenceCode}</TableCell>
      <TableCell className="max-w-sm whitespace-normal">
        <p className="font-medium leading-snug">{bug.title}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{bug.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1 empty:hidden">
          <RepeatBadges summary={links} />
        </div>
      </TableCell>
      <TableCell><BugStatusBadge value={bug.status} /></TableCell>
      <TableCell><BugSeverityBadge value={bug.severity} /></TableCell>
      <TableCell><BugPriorityBadge value={bug.priority} /></TableCell>
      <TableCell className="text-sm text-muted-foreground">{bug.reportedBy?.name ?? "—"}</TableCell>
      <TableCell>
        {bug.assignedTo ? (
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <Avatar className="size-6">
                <AvatarFallback className="text-[10px]">{initials(bug.assignedTo.name)}</AvatarFallback>
              </Avatar>
              <PresenceDot userId={bug.assignedTo.id} className="absolute -bottom-0.5 -right-0.5 size-2" />
            </div>
            <span className="text-sm">{bug.assignedTo.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {new Date(bug.createdAt).toLocaleDateString()}
      </TableCell>
    </TableRow>
  )
})

import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, Pencil, SlidersHorizontal, Trash2, ExternalLink, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PageLoader } from "@/components/shared/PageLoader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { BugSeverityBadge, BugPriorityBadge, BugStatusBadge } from "@/components/shared/StatusBadge"
import { BugManageDialog } from "@/components/bugs/BugManageDialog"
import { BugFormDialog } from "@/components/bugs/BugFormDialog"
import { BugAttachmentsSection } from "@/components/bugs/BugAttachmentsSection"
import { RelatedTickets } from "@/components/tickets/RelatedTickets"
import { OccurrenceBadge } from "@/components/tickets/RepeatBadges"
import { CommentThread } from "@/components/bugs/CommentThread"
import { StatusTimeline } from "@/components/shared/StatusTimeline"
import { useBug, useBugByCode, useBugHistory, useDeleteBug } from "@/hooks/useBugs"
import { useCase } from "@/hooks/useCases"
import { useCanManageProject } from "@/hooks/useProjects"
import { useAuth } from "@/contexts/AuthContext"
import { BUG_STATUS_META, isBugReportEditable, type BugStatus } from "@/lib/enums"
import { ApiError } from "@/transport/http"

// A closed bug can still be reopened, but at rest it shows no running clock.
const FINAL_STATUSES = ["Closed"]

function LinkedTestCase({ projectId, testCaseId }: { projectId: string; testCaseId: string }) {
  const { data: testCase } = useCase(testCaseId)
  if (!testCase) return null
  return (
    <Link
      to={`/projects/${projectId}/suites/${testCase.suiteId}/cases/${testCase.id}`}
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      <ExternalLink className="size-3.5" /> {testCase.title}
    </Link>
  )
}

export default function BugDetailPage() {
  const { projectId = "", id, code } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = useCanManageProject(projectId)

  const byId = useBug(id ?? "")
  const byCode = useBugByCode(code ?? "")
  const { data: bug, isLoading } = code ? byCode : byId
  const { data: history = [] } = useBugHistory(bug?.id ?? "")
  const del = useDeleteBug()
  const [editOpen, setEditOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (isLoading) return <PageLoader />
  if (!bug) return null

  // Reporters can fix mistakes in their own report; triage (Manage/Delete) stays
  // with admins and team leads — mirrors BugService.manageBug.
  const canEdit = canManage || (Boolean(user) && bug.reportedBy?.id === user?.id)
  // Even then, the report is only editable while the bug is Open or Reopened — see isBugReportEditable.
  const reportEditable = isBugReportEditable(bug.status)

  const handleShare = () => {
    const url = `${window.location.origin}/projects/${projectId}/bugs/ref/${bug.referenceCode}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied to clipboard")
  }

  return (
    <div className="space-y-6">
      <Link to={`/projects/${projectId}?tab=bugs`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to project
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{bug.referenceCode}</span>
            <h1 className="text-2xl font-semibold tracking-tight">{bug.title}</h1>
            <BugStatusBadge value={bug.status} />
            <BugSeverityBadge value={bug.severity} />
            <BugPriorityBadge value={bug.priority} />
            <OccurrenceBadge type="bug" id={bug.id} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {bug.reportedBy ? `Reported by ${bug.reportedBy.name}` : "Reported"}
            {bug.assignedTo && ` · Assigned to ${bug.assignedTo.name}`}
            {` · ${new Date(bug.createdAt).toLocaleDateString()}`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleShare} data-cy="bug-share">
            <Share2 className="mr-1 size-4" /> Share
          </Button>
          {canEdit && (
            // Shown but disabled once the bug moves on, so people can see why — the
            // wrapper carries the explanation because a disabled button takes no hover.
            <span
              title={
                reportEditable
                  ? undefined
                  : `This bug is ${bug.status}, so its report can no longer be edited. Reports can only be edited while a bug is Open or Reopened.`
              }
              data-cy="bug-edit-wrapper"
            >
              <Button
                variant="outline"
                onClick={() => setEditOpen(true)}
                disabled={!reportEditable}
                data-cy="bug-edit"
              >
                <Pencil className="mr-1 size-4" /> Edit
              </Button>
            </span>
          )}
          {canManage && (
            <>
              <Button variant="outline" onClick={() => setManageOpen(true)} data-cy="bug-manage">
                <SlidersHorizontal className="mr-1 size-4" /> Manage
              </Button>
              <Button variant="outline" onClick={() => setDeleteOpen(true)} data-cy="bug-delete">
                <Trash2 className="mr-1 size-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed">{bug.description}</p>

      {bug.stepsToReproduce.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Steps to reproduce</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {bug.stepsToReproduce.map((step, i) => <li key={i}>{step}</li>)}
          </ol>
        </div>
      )}

      {(bug.expectedBehavior || bug.actualBehavior) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {bug.expectedBehavior && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Expected behavior</p>
              <p className="whitespace-pre-wrap text-sm">{bug.expectedBehavior}</p>
            </div>
          )}
          {bug.actualBehavior && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Actual behavior</p>
              <p className="whitespace-pre-wrap text-sm">{bug.actualBehavior}</p>
            </div>
          )}
        </div>
      )}

      {bug.environment && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Environment</p>
          <p className="text-sm">{bug.environment}</p>
        </div>
      )}

      {(bug.testCaseId || bug.testRunId) && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Related to</p>
          <div className="flex flex-col gap-1">
            {bug.testCaseId && <LinkedTestCase projectId={projectId} testCaseId={bug.testCaseId} />}
            {bug.testRunId && (
              <Link
                to={`/projects/${projectId}/runs/${bug.testRunId}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" /> Test run
              </Link>
            )}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Status timeline</h3>
          <StatusTimeline
            history={history}
            labelFor={(s) => BUG_STATUS_META[s as BugStatus]?.label ?? s}
            finalStatuses={FINAL_STATUSES}
          />
        </div>
      )}

      <BugAttachmentsSection bugId={bug.id} />

      <RelatedTickets type="bug" ticketId={bug.id} projectId={bug.projectId} title={bug.title} />

      <Separator />

      <CommentThread bugId={bug.id} canModerate={canManage} />

      <BugFormDialog open={editOpen && reportEditable} onOpenChange={setEditOpen} projectId={projectId} bug={bug} />
      <BugManageDialog open={manageOpen} onOpenChange={setManageOpen} bug={bug} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete bug"
        description={`"${bug.title}" will be removed.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(bug.id, {
            onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
            onSuccess: () => {
              toast.success("Bug deleted")
              navigate(`/projects/${projectId}?tab=bugs`)
            },
          })
        }
      />
    </div>
  )
}

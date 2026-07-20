import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, Pencil, Trash2, ExternalLink, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PageLoader } from "@/components/shared/PageLoader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { BugSeverityBadge, BugPriorityBadge, BugStatusBadge } from "@/components/shared/StatusBadge"
import { BugManageDialog } from "@/components/bugs/BugManageDialog"
import { BugAttachmentsSection } from "@/components/bugs/BugAttachmentsSection"
import { useBug, useBugByCode, useDeleteBug } from "@/hooks/useBugs"
import { useCase } from "@/hooks/useCases"
import { useCanManageProject } from "@/hooks/useProjects"
import { ApiError } from "@/transport/http"

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
  const canManage = useCanManageProject(projectId)

  const byId = useBug(id ?? "")
  const byCode = useBugByCode(code ?? "")
  const { data: bug, isLoading } = code ? byCode : byId
  const del = useDeleteBug()
  const [manageOpen, setManageOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (isLoading) return <PageLoader />
  if (!bug) return null

  const handleShare = () => {
    const url = `${window.location.origin}/projects/${projectId}/bugs/ref/${bug.referenceCode}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied to clipboard")
  }

  return (
    <div className="space-y-6">
      <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
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
          {canManage && (
            <>
              <Button variant="outline" onClick={() => setManageOpen(true)} data-cy="bug-manage">
                <Pencil className="mr-1 size-4" /> Manage
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

      <BugAttachmentsSection bugId={bug.id} />

      <Separator />

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
              navigate(`/projects/${projectId}`)
            },
          })
        }
      />
    </div>
  )
}

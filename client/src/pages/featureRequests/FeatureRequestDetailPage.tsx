import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, Pencil, Trash2, ExternalLink, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PageLoader } from "@/components/shared/PageLoader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { FeatureRequestStatusBadge } from "@/components/shared/StatusBadge"
import { VoteButton } from "@/components/featureRequests/VoteButton"
import { StatusUpdateDialog } from "@/components/featureRequests/StatusUpdateDialog"
import { CommentThread } from "@/components/featureRequests/CommentThread"
import { FeatureRequestAttachmentsSection } from "@/components/featureRequests/FeatureRequestAttachmentsSection"
import { useFeatureRequest, useFeatureRequestByCode, useDeleteFeatureRequest } from "@/hooks/useFeatureRequests"
import { useCanManageProject } from "@/hooks/useProjects"
import { ApiError } from "@/transport/http"

export default function FeatureRequestDetailPage() {
  const { projectId = "", id, code } = useParams()
  const navigate = useNavigate()
  const canManage = useCanManageProject(projectId)

  const byId = useFeatureRequest(id ?? "")
  const byCode = useFeatureRequestByCode(code ?? "")
  const { data: request, isLoading } = code ? byCode : byId
  const del = useDeleteFeatureRequest()
  const [statusOpen, setStatusOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (isLoading) return <PageLoader />
  if (!request) return null

  const handleShare = () => {
    const url = `${window.location.origin}/projects/${projectId}/feature-requests/ref/${request.referenceCode}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied to clipboard")
  }

  return (
    <div className="space-y-6">
      <Link to={`/projects/${projectId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to project
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <VoteButton requestId={request.id} upvoteCount={request.upvoteCount} hasVoted={request.hasVoted} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{request.referenceCode}</span>
              <h1 className="text-2xl font-semibold tracking-tight">{request.title}</h1>
              <FeatureRequestStatusBadge value={request.status} />
              {request.category && <Badge variant="outline">{request.category}</Badge>}
              {request.module && <Badge variant="outline" className="text-muted-foreground">{request.module}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {request.submittedBy ? `Submitted by ${request.submittedBy.name}` : "Submitted"}
              {` · ${new Date(request.createdAt).toLocaleDateString()}`}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleShare} data-cy="fr-share">
            <Share2 className="mr-1 size-4" /> Share
          </Button>
          {canManage && (
            <>
              <Button variant="outline" onClick={() => setStatusOpen(true)} data-cy="fr-update-status">
                <Pencil className="mr-1 size-4" /> Update status
              </Button>
              <Button variant="outline" onClick={() => setDeleteOpen(true)} data-cy="fr-delete">
                <Trash2 className="mr-1 size-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{request.description}</p>

      {request.referenceLinks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Reference links</p>
          <ul className="space-y-1">
            {request.referenceLinks.map((link) => (
              <li key={link}>
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" /> {link}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {request.adminResponse && (
        <div className="rounded-lg border-l-2 border-primary bg-muted/30 p-4">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Team response</p>
          <p className="whitespace-pre-wrap break-words text-sm">{request.adminResponse}</p>
        </div>
      )}

      <FeatureRequestAttachmentsSection requestId={request.id} />

      <Separator />

      <CommentThread requestId={request.id} />

      <StatusUpdateDialog open={statusOpen} onOpenChange={setStatusOpen} request={request} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete feature request"
        description={`"${request.title}" will be removed.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(request.id, {
            onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
            onSuccess: () => {
              toast.success("Feature request deleted")
              navigate(`/projects/${projectId}`)
            },
          })
        }
      />
    </div>
  )
}

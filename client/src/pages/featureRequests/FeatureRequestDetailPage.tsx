import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, Pencil, Trash2 } from "lucide-react"
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
import { useFeatureRequest, useDeleteFeatureRequest } from "@/hooks/useFeatureRequests"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"
import { ApiError } from "@/transport/http"

export default function FeatureRequestDetailPage() {
  const { projectId = "", id = "" } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN

  const { data: request, isLoading } = useFeatureRequest(id)
  const del = useDeleteFeatureRequest()
  const [statusOpen, setStatusOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (isLoading) return <PageLoader />
  if (!request) return null

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
              <h1 className="text-2xl font-semibold tracking-tight">{request.title}</h1>
              <FeatureRequestStatusBadge value={request.status} />
              {request.category && <Badge variant="outline">{request.category}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {request.submittedBy ? `Submitted by ${request.submittedBy.name}` : "Submitted"}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStatusOpen(true)}>
              <Pencil className="mr-1 size-4" /> Update status
            </Button>
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1 size-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed">{request.description}</p>

      {request.adminResponse && (
        <div className="rounded-lg border-l-2 border-primary bg-muted/30 p-4">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Team response</p>
          <p className="whitespace-pre-wrap text-sm">{request.adminResponse}</p>
        </div>
      )}

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

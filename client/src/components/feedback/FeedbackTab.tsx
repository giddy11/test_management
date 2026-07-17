// External feedback triage tab: submissions from the project's public form,
// tracked through the support lifecycle. Admins manage the shareable link and
// the project's client companies (whose IT support pre-triages feedback);
// admins, team leads, and each item's assignee(s) can move feedback through
// the workflow (the external contact is emailed on every stage change) — only
// admins/team leads can reassign who's on it.
import { useMemo, useState } from "react"
import { Copy, Link2, Link2Off, MessageSquareHeart, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { FeedbackManageDialog } from "@/components/feedback/FeedbackManageDialog"
import { ClientCompaniesCard } from "@/components/feedback/ClientCompaniesCard"
import { useDeleteFeedback, useFeedback, useSetFeedbackLink } from "@/hooks/useFeedback"
import { useProject } from "@/hooks/useProjects"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"
import { ApiError } from "@/transport/http"
import {
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  type Feedback,
  type FeedbackSeverity,
  type FeedbackStatus,
} from "@/types/feedback.types"

const STATUS_VARIANT: Record<FeedbackStatus, "default" | "secondary" | "outline" | "destructive"> = {
  logged: "destructive",
  acknowledged: "secondary",
  assigned: "secondary",
  investigating: "secondary",
  resolved: "default",
  awaiting_confirmation: "default",
  closed: "outline",
}

const SEVERITY_VARIANT: Record<FeedbackSeverity, "default" | "secondary" | "outline" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  critical: "destructive",
}

interface Props {
  projectId: string
  canManage: boolean
}

export function FeedbackTab({ projectId, canManage }: Props) {
  const { user } = useAuth()
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPERADMIN
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [managing, setManaging] = useState<Feedback | null>(null)
  const [deleting, setDeleting] = useState<Feedback | null>(null)

  const { data: project } = useProject(projectId)
  const { data, isLoading } = useFeedback({
    projectId,
    page,
    limit: 20,
    status: statusFilter === "all" ? undefined : (statusFilter as FeedbackStatus),
  })
  const setLink = useSetFeedbackLink()
  const deleteFeedback = useDeleteFeedback()

  const items = data?.data ?? []
  const meta = data?.meta

  const publicUrl = useMemo(
    () =>
      project?.feedbackToken
        ? `${window.location.origin}/feedback/${project.feedbackToken}`
        : null,
    [project?.feedbackToken]
  )

  const toggleLink = (enabled: boolean) => {
    setLink.mutate(
      { projectId, enabled },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: ({ feedbackToken }) =>
          toast.success(feedbackToken ? "Public ticket form enabled" : "Public ticket form disabled"),
      }
    )
  }

  const copyLink = () => {
    if (!publicUrl) return
    navigator.clipboard.writeText(publicUrl)
    toast.success("Link copied — embed it in your application")
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareHeart className="size-4 text-primary" /> Public ticket form
            </CardTitle>
            <CardDescription>
              Share (or embed) this link in your application so end users — even those not on
              TestMate — can raise feature requests, bugs and complaints. They'll receive email
              updates as you progress each item.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {publicUrl ? (
              <>
                <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{publicUrl}</code>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  <Copy className="mr-1 size-3.5" /> Copy link
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleLink(false)} disabled={setLink.isPending}>
                  <Link2Off className="mr-1 size-3.5" /> Disable
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => toggleLink(true)} disabled={setLink.isPending}>
                <Link2 className="mr-1 size-3.5" /> Enable public form
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && <ClientCompaniesCard projectId={projectId} />}

      <div className="flex items-center justify-between gap-2">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {FEEDBACK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{FEEDBACK_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading tickets…</p>}
      {!isLoading && items.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No tickets yet{statusFilter !== "all" ? " for this status" : ""}.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((fb) => (
          <Card key={fb.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">#{fb.ticketNumber}</span>
                <CardTitle className="text-base">{fb.title}</CardTitle>
                <Badge variant="outline">{FEEDBACK_TYPE_LABELS[fb.type]}</Badge>
                {fb.suiteName && (
                  <Badge variant="outline" className="text-muted-foreground">{fb.suiteName}</Badge>
                )}
                {fb.clientCompanyName && (
                  <Badge variant="secondary">via {fb.clientCompanyName} IT</Badge>
                )}
                {fb.source === "integration" && (
                  <Badge variant="secondary">Via API</Badge>
                )}
                {fb.severity && (
                  <Badge variant={SEVERITY_VARIANT[fb.severity]}>
                    {FEEDBACK_SEVERITY_LABELS[fb.severity]}
                  </Badge>
                )}
                {fb.attachments.length > 0 && (
                  <Badge variant="secondary">{fb.attachments.length} 📎</Badge>
                )}
                <Badge variant={STATUS_VARIANT[fb.status]}>{FEEDBACK_STATUS_LABELS[fb.status]}</Badge>
              </div>
              <CardDescription>
                From {fb.submitterName} ({fb.submitterEmail}
                {fb.submitterPhone && <> · {fb.submitterPhone}</>}) ·{" "}
                {new Date(fb.createdAt).toLocaleDateString()}
                {fb.assignees.length > 0 && (
                  <> · assigned to {fb.assignees.map((a) => a.name).join(", ")}</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-start justify-between gap-3 pt-0">
              <p className="line-clamp-2 text-sm text-muted-foreground">{fb.description}</p>
              <div className="flex shrink-0 items-center gap-2">
                {(canManage || fb.assignees.some((a) => a.id === user?.id)) && (
                  <Button size="sm" variant="outline" onClick={() => setManaging(fb)}>
                    Manage
                  </Button>
                )}
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(fb)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={!meta.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <FeedbackManageDialog
        feedback={managing}
        members={project?.members ?? []}
        canReassign={canManage}
        onOpenChange={(o) => !o && setManaging(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete ticket"
        description={`"${deleting?.title}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteFeedback.isPending}
        onConfirm={() =>
          deleting &&
          deleteFeedback.mutate(deleting.id, {
            onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
            onSuccess: () => {
              toast.success("Ticket deleted")
              setDeleting(null)
            },
          })
        }
      />
    </div>
  )
}

// External feedback triage tab: submissions from the project's public form,
// tracked through the support lifecycle. Admins manage the shareable link;
// admins + team leads move feedback through the workflow (the submitter is
// emailed on every stage change).
import { useMemo, useState } from "react"
import { Copy, Link2, Link2Off, MessageSquareHeart } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useFeedback, useManageFeedback, useSetFeedbackLink } from "@/hooks/useFeedback"
import { useProject } from "@/hooks/useProjects"
import { useUsers } from "@/hooks/useUsers"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"
import { ApiError } from "@/transport/http"
import {
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  type Feedback,
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

  const { data: project } = useProject(projectId)
  const { data, isLoading } = useFeedback({
    projectId,
    page,
    limit: 20,
    status: statusFilter === "all" ? undefined : (statusFilter as FeedbackStatus),
  })
  const setLink = useSetFeedbackLink()

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
          toast.success(feedbackToken ? "Public feedback form enabled" : "Public feedback form disabled"),
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
              <MessageSquareHeart className="size-4 text-primary" /> Public feedback form
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

      {isLoading && <p className="text-sm text-muted-foreground">Loading feedback…</p>}
      {!isLoading && items.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No external feedback yet{statusFilter !== "all" ? " for this status" : ""}.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((fb) => (
          <Card key={fb.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{fb.title}</CardTitle>
                <Badge variant="outline">{FEEDBACK_TYPE_LABELS[fb.type]}</Badge>
                {fb.suiteName && (
                  <Badge variant="outline" className="text-muted-foreground">{fb.suiteName}</Badge>
                )}
                {fb.attachments.length > 0 && (
                  <Badge variant="secondary">{fb.attachments.length} 📎</Badge>
                )}
                <Badge variant={STATUS_VARIANT[fb.status]}>{FEEDBACK_STATUS_LABELS[fb.status]}</Badge>
              </div>
              <CardDescription>
                From {fb.submitterName} ({fb.submitterEmail}) ·{" "}
                {new Date(fb.createdAt).toLocaleDateString()}
                {fb.assignedTo && <> · assigned to {fb.assignedTo.name}</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-start justify-between gap-3 pt-0">
              <p className="line-clamp-2 text-sm text-muted-foreground">{fb.description}</p>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setManaging(fb)}>
                  Manage
                </Button>
              )}
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

      <FeedbackManageDialog feedback={managing} onOpenChange={(o) => !o && setManaging(null)} />
    </div>
  )
}

// ── Manage dialog ───────────────────────────────────────────────────────────────

function FeedbackManageDialog({
  feedback,
  onOpenChange,
}: {
  feedback: Feedback | null
  onOpenChange: (open: boolean) => void
}) {
  const manage = useManageFeedback()
  const { data: usersData } = useUsers({ limit: 100 })
  const users = usersData?.data ?? []
  const [status, setStatus] = useState<FeedbackStatus | "">("")
  const [assignedToId, setAssignedToId] = useState<string>("")
  const [response, setResponse] = useState("")

  // Sync local state when a new item is opened.
  const [lastId, setLastId] = useState<string | null>(null)
  if (feedback && feedback.id !== lastId) {
    setLastId(feedback.id)
    setStatus(feedback.status)
    setAssignedToId(feedback.assignedTo?.id ?? "")
    setResponse(feedback.adminResponse ?? "")
  }

  const save = () => {
    if (!feedback) return
    manage.mutate(
      {
        id: feedback.id,
        payload: {
          status: status || undefined,
          assignedToId: assignedToId || null,
          adminResponse: response || null,
        },
      },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => {
          toast.success("Feedback updated — the submitter will be emailed if the stage changed")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={Boolean(feedback)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage feedback</DialogTitle>
          <DialogDescription>
            {feedback?.title} — from {feedback?.submitterName}
          </DialogDescription>
        </DialogHeader>

        {feedback && (
          <div className="grid gap-4">
            <p className="max-h-40 overflow-y-auto whitespace-pre-line rounded-md bg-muted p-3 text-sm">
              {feedback.description}
            </p>

            {feedback.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {feedback.attachments.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                    <img
                      src={a.url}
                      alt="Attachment"
                      className="size-20 rounded-md border object-cover transition-opacity hover:opacity-80"
                    />
                  </a>
                ))}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as FeedbackStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{FEEDBACK_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Assign to</Label>
                <Select
                  value={assignedToId || "none"}
                  onValueChange={(v) => setAssignedToId(v === "none" ? "" : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="fb-response">Note to the submitter (optional, goes in the email)</Label>
              <Textarea
                id="fb-response"
                rows={3}
                maxLength={3000}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={manage.isPending}>
            {manage.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

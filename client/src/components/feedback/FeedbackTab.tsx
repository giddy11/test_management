// External feedback triage tab: submissions from the project's public form,
// tracked through the support lifecycle. Admins manage the shareable link and
// the project's client companies (whose IT support pre-triages feedback);
// admins, team leads, and each item's assignee(s) can move feedback through
// the workflow (the external contact is emailed on every stage change) — only
// admins/team leads can reassign who's on it.
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Copy, Link2, Link2Off, MessageSquareHeart, MoreHorizontal, Trash2 } from "lucide-react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { ClearFiltersButton } from "@/components/shared/ClearFiltersButton"
import { FeedbackManageDialog } from "@/components/feedback/FeedbackManageDialog"
import { ClientCompaniesCard } from "@/components/feedback/ClientCompaniesCard"
import { RepeatBadges } from "@/components/tickets/RepeatBadges"
import { useDeleteFeedback, useFeedback, useSetFeedbackLink } from "@/hooks/useFeedback"
import { useProject } from "@/hooks/useProjects"
import { useTicketLinkSummary } from "@/hooks/useTicketLinks"
import { useAuth } from "@/contexts/AuthContext"
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
  // Enabling or rotating the public form link is the project's team lead's call
  // (or a holder of project.manageall) -- exactly what canManage already says.
  const canConfigureForm = canManage
  // A client company belongs to the project, so managing one is the team lead's
  // call too (canManage), not a platform permission.
  const canManageCompanies = canManage
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
  // "Reported 3×" / "Repeat" badges for the tickets on this page.
  const { data: linkSummary } = useTicketLinkSummary(projectId, "feedback", items.map((i) => i.id))

  // A link from another ticket arrives as ?ticket=TKT-… — tickets have no page of
  // their own, so open the one it names in its manage dialog, then drop the param.
  const [searchParams, setSearchParams] = useSearchParams()
  const ticketParam = searchParams.get("ticket")
  const { data: linked } = useFeedback(
    { projectId, search: ticketParam ?? undefined, limit: 1 },
    Boolean(ticketParam)
  )
  useEffect(() => {
    if (!ticketParam || !linked) return
    const target = linked.data[0]
    if (!target) {
      toast.error("That ticket could not be found")
    } else if (canManage || target.assignees.some((a) => a.id === user?.id)) {
      setManaging(target)
    } else {
      toast.info("Only the ticket's assignee or the project's team lead can open it")
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete("ticket")
        return next
      },
      { replace: true }
    )
  }, [ticketParam, linked, canManage, user?.id, setSearchParams])

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
      {canConfigureForm && (
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

      {canManageCompanies && <ClientCompaniesCard projectId={projectId} />}

      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {FEEDBACK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{FEEDBACK_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ClearFiltersButton
          active={statusFilter !== "all"}
          onClick={() => { setStatusFilter("all"); setPage(1) }}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Ref</TableHead>
              <TableHead>Ticket</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>From</TableHead>
              <TableHead className="w-36">Assigned to</TableHead>
              <TableHead className="w-24">Received</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  Loading tickets…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  No tickets yet{statusFilter !== "all" ? " for this status" : ""}.
                </TableCell>
              </TableRow>
            )}
            {items.map((fb) => {
              const canManageItem = canManage || fb.assignees.some((a) => a.id === user?.id)
              return (
                <TableRow key={fb.id} data-cy="ticket-row">
                  <TableCell className="font-mono text-xs text-muted-foreground">{fb.ticketCode}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium leading-snug">{fb.title}</p>
                      {fb.attachments.length > 0 && (
                        <span
                          className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                          title={`${fb.attachments.length} attachment${fb.attachments.length === 1 ? "" : "s"}`}
                        >
                          {fb.attachments.length} 📎
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{fb.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{FEEDBACK_TYPE_LABELS[fb.type]}</Badge>
                      {fb.severity && (
                        <Badge variant={SEVERITY_VARIANT[fb.severity]} className="text-[10px]">
                          {FEEDBACK_SEVERITY_LABELS[fb.severity]}
                        </Badge>
                      )}
                      {fb.suiteName && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">{fb.suiteName}</Badge>
                      )}
                      {fb.clientCompanyName && (
                        <Badge variant="secondary" className="text-[10px]">via {fb.clientCompanyName} IT</Badge>
                      )}
                      {fb.channel === "whatsapp" && (
                        <Badge variant="secondary" className="text-[10px]">via WhatsApp</Badge>
                      )}
                      <RepeatBadges summary={linkSummary?.[fb.id]} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[fb.status]}>{FEEDBACK_STATUS_LABELS[fb.status]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-40 text-sm">
                    <p className="truncate">{fb.submitterName}</p>
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={fb.submitterPhone ? `${fb.submitterEmail} · ${fb.submitterPhone}` : fb.submitterEmail}
                    >
                      {fb.submitterEmail}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-36 truncate text-sm text-muted-foreground">
                    {fb.assignees.length > 0 ? fb.assignees.map((a) => a.name).join(", ") : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(fb.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </TableCell>
                  <TableCell>
                    {canManageItem && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Ticket actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setManaging(fb)}>Manage</DropdownMenuItem>
                          {canManage && (
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(fb)}>
                              <Trash2 className="size-3.5" /> Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
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

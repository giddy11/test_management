// pages/feedback/AllFeedbackPage.tsx — every feedback item across all projects
// the viewer can access (superadmin: all orgs, admin: own org, user: member
// projects), in one filterable list — no per-project clicking. Items still in
// a client company's IT queue are excluded by the backend until escalated.
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { MessageSquareHeart, MoreHorizontal, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { FeedbackManageDialog } from "@/components/feedback/FeedbackManageDialog"
import { useDeleteFeedback, useFeedback } from "@/hooks/useFeedback"
import { useProject, useProjects } from "@/hooks/useProjects"
import { useDebounce } from "@/hooks/useDebounce"
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
  type FeedbackType,
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

export default function AllFeedbackPage() {
  const { user } = useAuth()
  const [projectFilter, setProjectFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  // ?q= pre-fills the search — how the SLA dashboard drill-down deep-links a
  // ticket here by its TKT code.
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [page, setPage] = useState(1)
  const [managing, setManaging] = useState<Feedback | null>(null)
  const [deleting, setDeleting] = useState<Feedback | null>(null)

  // A second deep link while already on this page changes the URL but not the
  // state initialised from it — global search lands here repeatedly, so follow it.
  const deepLinkedQuery = searchParams.get("q")
  useEffect(() => {
    if (deepLinkedQuery === null) return
    setSearch(deepLinkedQuery)
    setPage(1)
  }, [deepLinkedQuery])

  const debouncedSearch = useDebounce(search, 300)
  const { data: projectsData } = useProjects({ limit: 100 })
  const projects = projectsData?.data ?? []

  const { data, isLoading } = useFeedback({
    projectId: projectFilter === "all" ? undefined : projectFilter,
    page,
    limit: 20,
    status: statusFilter === "all" ? undefined : (statusFilter as FeedbackStatus),
    type: typeFilter === "all" ? undefined : (typeFilter as FeedbackType),
    search: debouncedSearch || undefined,
  })
  const deleteFeedback = useDeleteFeedback()

  const items = data?.data ?? []
  const meta = data?.meta

  // The manage dialog needs the item's project members for reassignment —
  // loaded lazily for the project of the item being managed.
  const { data: managingProject } = useProject(managing?.projectId ?? "")

  const hasFilters =
    projectFilter !== "all" || statusFilter !== "all" || typeFilter !== "all" || search !== ""

  const clearFilters = () => {
    setProjectFilter("all")
    setStatusFilter("all")
    setTypeFilter("all")
    setSearch("")
    setPage(1)
  }

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]))
    return (fb: Feedback) => fb.projectName ?? map.get(fb.projectId) ?? null
  }, [projects])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <MessageSquareHeart className="size-6 text-primary" /> All tickets
        </h1>
        <p className="text-sm text-muted-foreground">
          Tickets raised across every product you have access to — filter by product, status,
          or type instead of opening each project.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); setPage(1) }}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {FEEDBACK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{FEEDBACK_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(FEEDBACK_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-56 pl-8"
            placeholder="Search title or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
        )}
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
                  No tickets found{hasFilters ? " for these filters" : ""}.
                </TableCell>
              </TableRow>
            )}
            {items.map((fb) => {
              // canManage comes from the server: admin/superadmin, or this
              // ticket's project's team lead (see FeedbackService.fetchFeedback).
              // An assignee who is neither can still drive status/notes, just
              // not reassign or delete — same split as the project Tickets tab.
              const canManageProject = Boolean(fb.canManage)
              const canManageItem = canManageProject || fb.assignees.some((a) => a.id === user?.id)
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
                      {projectName(fb) && (
                        <Badge variant="outline" className="border-primary/40 text-[10px]">{projectName(fb)}</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">{FEEDBACK_TYPE_LABELS[fb.type]}</Badge>
                      {fb.severity && (
                        <Badge variant={SEVERITY_VARIANT[fb.severity]} className="text-[10px]">
                          {FEEDBACK_SEVERITY_LABELS[fb.severity]}
                        </Badge>
                      )}
                      {fb.clientCompanyName && (
                        <Badge variant="secondary" className="text-[10px]">via {fb.clientCompanyName} IT</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[fb.status]}>{FEEDBACK_STATUS_LABELS[fb.status]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-40 text-sm">
                    <p className="truncate">{fb.submitterName}</p>
                    <p className="truncate text-xs text-muted-foreground" title={fb.submitterEmail}>
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
                          {canManageItem && (
                            <DropdownMenuItem onClick={() => setManaging(fb)}>Manage</DropdownMenuItem>
                          )}
                          {canManageProject && (
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
        members={managingProject?.members ?? []}
        canReassign={Boolean(managing?.canManage)}
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

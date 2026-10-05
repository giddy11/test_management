import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useUpdateFeatureRequestStatus } from "@/hooks/useFeatureRequests"
import type { ProjectMember } from "@/types/project.types"
import {
  FEATURE_REQUEST_STATUSES,
  FEATURE_REQUEST_STATUS_META,
  isFeatureRequestFinal,
  isFeatureRequestStatusSelectable,
  isFeatureRequestAssignable,
  isFeatureRequestAssigneeRequired,
  type FeatureRequestStatus,
} from "@/lib/enums"
import { ApiError } from "@/transport/http"
import type { FeatureRequest } from "@/types/featureRequest.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: FeatureRequest | null
  // The assignee must be on this project — same rule the API enforces.
  members: ProjectMember[]
}

export function StatusUpdateDialog({ open, onOpenChange, request, members }: Props) {
  const update = useUpdateFeatureRequestStatus()
  const [status, setStatus] = useState<FeatureRequestStatus>("new")
  const [adminResponse, setAdminResponse] = useState("")
  const [assignedToId, setAssignedToId] = useState<string>("unassigned")

  useEffect(() => {
    if (open && request) {
      setStatus(request.status)
      setAdminResponse(request.adminResponse ?? "")
      setAssignedToId(request.assignedTo?.id ?? "unassigned")
    }
  }, [open, request])

  const needsAssignee = isFeatureRequestAssigneeRequired(status) && assignedToId === "unassigned"

  const onSubmit = () => {
    if (!request) return
    update.mutate(
      {
        id: request.id,
        payload: {
          status,
          adminResponse: adminResponse || null,
          assignedToId: assignedToId === "unassigned" ? null : assignedToId,
        },
      },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => {
          toast.success("Feature request updated")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update status</DialogTitle>
          <DialogDescription>{request?.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as FeatureRequestStatus)}>
              <SelectTrigger data-cy="fr-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FEATURE_REQUEST_STATUSES.map((s) => (
                  <SelectItem
                    key={s}
                    value={s}
                    disabled={Boolean(request) && !isFeatureRequestStatusSelectable(request!.status, s)}
                  >
                    {FEATURE_REQUEST_STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {request && isFeatureRequestFinal(request.status)
                ? `${FEATURE_REQUEST_STATUS_META[request.status].label} is final — the status can't change any more.`
                : "Status can only move forward — earlier stages can't be selected."}
            </p>
          </div>
          {isFeatureRequestAssignable(status) && (
            <div className="grid gap-1.5">
              <Label>Assignee (project members only)</Label>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger data-cy="fr-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {/* Carries over a previously valid assignee who has since left
                      the project, so the save button isn't silently stuck on them. */}
                  {request?.assignedTo && !members.some((m) => m.id === request.assignedTo!.id) && (
                    <SelectItem value={request.assignedTo.id}>
                      {request.assignedTo.name} (no longer on this project)
                    </SelectItem>
                  )}
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {needsAssignee && (
                <p className="text-xs text-destructive">
                  {FEATURE_REQUEST_STATUS_META[status].label} requests must be assigned to someone.
                </p>
              )}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="adminResponse">Response (optional)</Label>
            <Textarea
              id="adminResponse"
              rows={3}
              placeholder="Let the submitter know what's happening with this request…"
              value={adminResponse}
              onChange={(e) => setAdminResponse(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={update.isPending || needsAssignee} data-cy="fr-status-save">
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

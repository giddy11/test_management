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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useManageBug } from "@/hooks/useBugs"
import { useUsers } from "@/hooks/useUsers"
import {
  BUG_STATUSES,
  BUG_STATUS_META,
  BUG_SEVERITIES,
  BUG_PRIORITIES,
  isBugStatusSelectable,
  isBugAssigneeRequired,
  type BugStatus,
  type BugSeverity,
  type BugPriority,
} from "@/lib/enums"
import { ApiError } from "@/transport/http"
import type { Bug } from "@/types/bug.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  bug: Bug | null
}

export function BugManageDialog({ open, onOpenChange, bug }: Props) {
  const manage = useManageBug()
  const { data: usersData } = useUsers({ limit: 100 })
  const users = usersData?.data ?? []

  const [status, setStatus] = useState<BugStatus>("Open")
  const [severity, setSeverity] = useState<BugSeverity>("Minor")
  const [priority, setPriority] = useState<BugPriority>("Medium")
  const [assignedToId, setAssignedToId] = useState<string>("unassigned")

  useEffect(() => {
    if (open && bug) {
      setStatus(bug.status)
      setSeverity(bug.severity)
      setPriority(bug.priority)
      setAssignedToId(bug.assignedTo?.id ?? "unassigned")
    }
  }, [open, bug])

  const needsAssignee = isBugAssigneeRequired(status) && assignedToId === "unassigned"

  const onSubmit = () => {
    if (!bug) return
    manage.mutate(
      {
        id: bug.id,
        payload: {
          status,
          severity,
          priority,
          assignedToId: assignedToId === "unassigned" ? null : assignedToId,
        },
      },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => {
          toast.success("Bug updated")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage bug</DialogTitle>
          <DialogDescription>{bug?.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as BugStatus)}>
              <SelectTrigger data-cy="bug-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUG_STATUSES.map((s) => (
                  <SelectItem
                    key={s}
                    value={s}
                    disabled={Boolean(bug) && !isBugStatusSelectable(bug!.status, s)}
                  >
                    {BUG_STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Status can only move forward. A fixed bug can be Reopened if it resurfaces.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as BugSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUG_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as BugPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUG_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Assignee</Label>
            <Select value={assignedToId} onValueChange={setAssignedToId}>
              <SelectTrigger data-cy="bug-assignee"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {needsAssignee && (
              <p className="text-xs text-destructive">
                An In Progress bug must be assigned to someone.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={manage.isPending || needsAssignee} data-cy="bug-manage-save">
            {manage.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { FEATURE_REQUEST_STATUSES, FEATURE_REQUEST_STATUS_META, type FeatureRequestStatus } from "@/lib/enums"
import { ApiError } from "@/transport/http"
import type { FeatureRequest } from "@/types/featureRequest.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: FeatureRequest | null
}

export function StatusUpdateDialog({ open, onOpenChange, request }: Props) {
  const update = useUpdateFeatureRequestStatus()
  const [status, setStatus] = useState<FeatureRequestStatus>("new")
  const [adminResponse, setAdminResponse] = useState("")

  useEffect(() => {
    if (open && request) {
      setStatus(request.status)
      setAdminResponse(request.adminResponse ?? "")
    }
  }, [open, request])

  const onSubmit = () => {
    if (!request) return
    update.mutate(
      { id: request.id, payload: { status, adminResponse: adminResponse || null } },
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
                  <SelectItem key={s} value={s}>{FEATURE_REQUEST_STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          <Button type="button" onClick={onSubmit} disabled={update.isPending} data-cy="fr-status-save">
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

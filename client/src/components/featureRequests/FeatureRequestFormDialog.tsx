import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { FormField } from "@/components/shared/FormField"
import { PendingAttachmentsField } from "@/components/shared/PendingAttachmentsField"
import { useCreateFeatureRequest } from "@/hooks/useFeatureRequests"
import { useSuites } from "@/hooks/useSuites"
import { featureRequestSchema, linesToArray, type FeatureRequestForm } from "@/lib/testMgmtValidation"
import { ApiError } from "@/transport/http"
import { FeatureRequestAttachmentEndpoints } from "@/endpoints/featureRequest.endpoints"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

export function FeatureRequestFormDialog({ open, onOpenChange, projectId }: Props) {
  const create = useCreateFeatureRequest()
  const { data: suites = [] } = useSuites(projectId)
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FeatureRequestForm>({ resolver: zodResolver(featureRequestSchema) })

  const moduleValue = watch("module")

  useEffect(() => {
    if (open) {
      reset({ title: "", description: "", category: "", module: "", referenceLinksText: "" })
      setFiles([])
    }
  }, [open, reset])

  const onSubmit = async (values: FeatureRequestForm) => {
    const referenceLinks = values.referenceLinksText ? linesToArray(values.referenceLinksText) : undefined
    try {
      const request = await create.mutateAsync({
        projectId,
        title: values.title,
        description: values.description,
        category: values.category || undefined,
        module: values.module || undefined,
        referenceLinks,
      })

      if (files.length > 0) {
        setUploading(true)
        const res = await FeatureRequestAttachmentEndpoints.upload(request.id, files)
        if (!res.success) toast.error(res.message || "Request submitted, but attachments failed to upload")
      }

      toast.success("Feature request submitted")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Suggest a feature</DialogTitle>
          <DialogDescription>Tell us what you'd like to see in TestMate.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <FormField id="title" label="Title" error={errors.title?.message} {...register("title")} />

          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={4} {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="category"
              label="Category (optional)"
              placeholder="UI/UX, Reporting, Integration…"
              {...register("category")}
            />
            <div className="grid gap-1.5">
              <Label>Module (optional)</Label>
              <Select
                value={moduleValue || "none"}
                onValueChange={(v) => setValue("module", v === "none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Pick a suite" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {suites.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="referenceLinksText">Reference links (optional, one per line)</Label>
            <Textarea
              id="referenceLinksText"
              rows={2}
              placeholder={"https://example.com/mockup\nhttps://docs.example.com/spec"}
              {...register("referenceLinksText")}
            />
          </div>

          <PendingAttachmentsField files={files} onChange={setFiles} disabled={create.isPending || uploading} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || uploading} data-cy="feature-request-submit">
              {uploading ? "Uploading…" : create.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

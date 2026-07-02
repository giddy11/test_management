import { useEffect } from "react"
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
import { FormField } from "@/components/shared/FormField"
import { useCreateFeatureRequest } from "@/hooks/useFeatureRequests"
import { featureRequestSchema, type FeatureRequestForm } from "@/lib/testMgmtValidation"
import { ApiError } from "@/transport/http"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

export function FeatureRequestFormDialog({ open, onOpenChange, projectId }: Props) {
  const create = useCreateFeatureRequest()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FeatureRequestForm>({ resolver: zodResolver(featureRequestSchema) })

  useEffect(() => {
    if (open) reset({ title: "", description: "", category: "" })
  }, [open, reset])

  const onSubmit = (values: FeatureRequestForm) => {
    create.mutate(
      { projectId, title: values.title, description: values.description, category: values.category || undefined },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => {
          toast.success("Feature request submitted")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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

          <FormField
            id="category"
            label="Category (optional)"
            placeholder="UI/UX, Reporting, Integration…"
            {...register("category")}
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

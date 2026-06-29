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
import { FormField } from "@/components/shared/FormField"
import { useCreateProject, useUpdateProject } from "@/hooks/useProjects"
import { projectSchema, type ProjectForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"
import type { Project } from "@/types/project.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Project | null
}

export function ProjectFormDialog({ open, onOpenChange, editing }: Props) {
  const create = useCreateProject()
  const update = useUpdateProject()
  const isEdit = Boolean(editing)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectForm>({ resolver: zodResolver(projectSchema) })

  useEffect(() => {
    if (open) {
      reset({
        name: editing?.name ?? "",
        description: editing?.description ?? "",
      })
    }
  }, [open, editing, reset])

  const onSubmit = (values: ProjectForm) => {
    const payload = { name: values.name, description: values.description || undefined }
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : "Something went wrong")

    if (isEdit && editing) {
      update.mutate(
        { id: editing.id, payload },
        {
          onError,
          onSuccess: () => {
            toast.success("Project updated")
            onOpenChange(false)
          },
        }
      )
    } else {
      create.mutate(payload, {
        onError,
        onSuccess: () => {
          toast.success("Project created")
          onOpenChange(false)
        },
      })
    }
  }

  const pending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this project's details." : "Create a project to organise test suites."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <FormField id="name" label="Name" error={errors.name?.message} {...register("name")} />
          <FormField id="description" label="Description (optional)" {...register("description")} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

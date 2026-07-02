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
import { useCreateSuite, useUpdateSuite } from "@/hooks/useSuites"
import { suiteSchema, type SuiteForm } from "@/lib/testMgmtValidation"
import { ApiError } from "@/transport/http"
import type { TestSuite } from "@/types/testMgmt.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  editing: TestSuite | null
}

export function SuiteFormDialog({ open, onOpenChange, projectId, editing }: Props) {
  const create = useCreateSuite()
  const update = useUpdateSuite()
  const isEdit = Boolean(editing)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SuiteForm>({ resolver: zodResolver(suiteSchema) })

  useEffect(() => {
    if (open) reset({ name: editing?.name ?? "", description: editing?.description ?? "" })
  }, [open, editing, reset])

  const onSubmit = (values: SuiteForm) => {
    const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Failed")
    const done = (msg: string) => () => {
      toast.success(msg)
      onOpenChange(false)
    }
    if (isEdit && editing) {
      update.mutate(
        { id: editing.id, payload: { name: values.name, description: values.description || undefined } },
        { onError, onSuccess: done("Suite updated") }
      )
    } else {
      create.mutate(
        { name: values.name, description: values.description || undefined, projectId },
        { onError, onSuccess: done("Suite created") }
      )
    }
  }

  const pending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit suite" : "New test suite"}</DialogTitle>
          <DialogDescription>Group related test cases (e.g. Auth, Checkout).</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <FormField id="name" label="Name" error={errors.name?.message} {...register("name")} />
          <FormField id="description" label="Description (optional)" {...register("description")} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} data-tour="create-suite-submit-btn">
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create suite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

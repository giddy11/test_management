// Create/edit a client company (an external company using this product whose
// IT support pre-triages its users' feedback).
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
import { useCreateClientCompany, useUpdateClientCompany } from "@/hooks/useClientCompanies"
import { clientCompanySchema, type ClientCompanyForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"
import type { ClientCompany } from "@/types/clientCompany.types"

interface Props {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: ClientCompany | null
}

export function ClientCompanyFormDialog({ projectId, open, onOpenChange, editing }: Props) {
  const create = useCreateClientCompany()
  const update = useUpdateClientCompany()
  const isEdit = Boolean(editing)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClientCompanyForm>({ resolver: zodResolver(clientCompanySchema) })

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? { name: editing.name, contactEmail: editing.contactEmail ?? "" }
          : { name: "", contactEmail: "" }
      )
    }
  }, [open, editing, reset])

  const onSubmit = (values: ClientCompanyForm) => {
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : "Something went wrong")
    const payload = {
      name: values.name,
      contactEmail: values.contactEmail || undefined,
    }

    if (isEdit && editing) {
      update.mutate(
        { id: editing.id, payload },
        {
          onError,
          onSuccess: () => {
            toast.success("Client company updated")
            onOpenChange(false)
          },
        }
      )
    } else {
      create.mutate(
        { projectId, ...payload },
        {
          onError,
          onSuccess: () => {
            toast.success("Client company added")
            onOpenChange(false)
          },
        }
      )
    }
  }

  const pending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client company" : "Add client company"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this client company's details."
              : "A company using this product. Its IT support team triages their users' tickets before anything reaches you."}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <FormField id="cc-name" label="Company name" error={errors.name?.message} {...register("name")} />
          <FormField
            id="cc-contact"
            label="Contact email (optional)"
            type="email"
            error={errors.contactEmail?.message}
            {...register("contactEmail")}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

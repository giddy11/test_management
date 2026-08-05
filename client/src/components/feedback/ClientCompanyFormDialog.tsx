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
          ? {
              name: editing.name,
              contactEmail: editing.contactEmail ?? "",
              // Unused in edit mode — the fields are hidden, but the schema
              // requires them, same as UserFormDialog's placeholder password.
              supporterFirstName: "x",
              supporterLastName: "x",
              supporterEmail: "placeholder@example.com",
              supporterPassword: "Placeholder1",
            }
          : {
              name: "",
              contactEmail: "",
              supporterFirstName: "",
              supporterLastName: "",
              supporterEmail: "",
              supporterPassword: "",
            }
      )
    }
  }, [open, editing, reset])

  const onSubmit = (values: ClientCompanyForm) => {
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : "Something went wrong")

    if (isEdit && editing) {
      update.mutate(
        {
          id: editing.id,
          payload: { name: values.name, contactEmail: values.contactEmail || undefined },
        },
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
        {
          projectId,
          name: values.name,
          contactEmail: values.contactEmail || undefined,
          supporter: {
            firstName: values.supporterFirstName,
            lastName: values.supporterLastName,
            email: values.supporterEmail,
            password: values.supporterPassword,
          },
        },
        {
          onError,
          onSuccess: () => {
            toast.success("Client company added — its first IT supporter has been emailed sign-in details")
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

          {!isEdit && (
            <div className="grid gap-4 rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                First IT supporter — becomes this company's primary lead and is emailed sign-in
                details.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  id="cc-sup-first"
                  label="First name"
                  error={errors.supporterFirstName?.message}
                  {...register("supporterFirstName")}
                />
                <FormField
                  id="cc-sup-last"
                  label="Last name"
                  error={errors.supporterLastName?.message}
                  {...register("supporterLastName")}
                />
              </div>
              <FormField
                id="cc-sup-email"
                label="Email"
                type="email"
                error={errors.supporterEmail?.message}
                {...register("supporterEmail")}
              />
              <FormField
                id="cc-sup-password"
                label="Temporary password"
                type="text"
                error={errors.supporterPassword?.message}
                {...register("supporterPassword")}
              />
            </div>
          )}

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

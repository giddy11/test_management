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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormField } from "@/components/shared/FormField"
import { useCreateUser, useUpdateUser } from "@/hooks/useUsers"
import { createUserSchema, type CreateUserForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"
import type { User } from "@/types/auth.types"
import type { ManageableRole } from "@/types/user.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: User | null
}

export function UserFormDialog({ open, onOpenChange, editing }: Props) {
  const create = useCreateUser()
  const update = useUpdateUser()
  const isEdit = Boolean(editing)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "user" },
  })

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? {
              firstName: editing.firstName,
              lastName: editing.lastName,
              email: editing.email,
              password: "Placeholder1", // unused in edit mode
              role: (editing.role === "admin" ? "admin" : "user") as ManageableRole,
            }
          : { firstName: "", lastName: "", email: "", password: "", role: "user" }
      )
    }
  }, [open, editing, reset])

  const role = watch("role")

  const onSubmit = (values: CreateUserForm) => {
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : "Something went wrong")

    if (isEdit && editing) {
      update.mutate(
        { id: editing.id, payload: { firstName: values.firstName, lastName: values.lastName, role: values.role } },
        {
          onError,
          onSuccess: () => {
            toast.success("User updated")
            onOpenChange(false)
          },
        }
      )
    } else {
      create.mutate(values, {
        onError,
        onSuccess: () => {
          toast.success("User added")
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
          <DialogTitle>{isEdit ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this user's details." : "Add a new user to your organisation."}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="firstName" label="First name" error={errors.firstName?.message} {...register("firstName")} />
            <FormField id="lastName" label="Last name" error={errors.lastName?.message} {...register("lastName")} />
          </div>
          <FormField
            id="email"
            label="Email"
            type="email"
            disabled={isEdit}
            error={errors.email?.message}
            {...register("email")}
          />
          {!isEdit && (
            <FormField
              id="password"
              label="Temporary password"
              type="text"
              error={errors.password?.message}
              {...register("password")}
            />
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setValue("role", v as ManageableRole)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Company Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

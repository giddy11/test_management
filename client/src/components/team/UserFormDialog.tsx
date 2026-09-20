import { useEffect, useMemo, useState } from "react"
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
import { FormField } from "@/components/shared/FormField"
import { useCreateUser, useUpdateUser } from "@/hooks/useUsers"
import { useRoles, useSetUserRoles } from "@/hooks/useAccess"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/contexts/AuthContext"
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
  const setUserRoles = useSetUserRoles()
  const { can } = useAuth()
  const isEdit = Boolean(editing)

  // The same roles list the Roles & access editor shows. Assigning is its own
  // permission — someone who may edit a name still may not change what that
  // person can do.
  const canAssign = can("role.assign")
  const { data: roles } = useRoles(canAssign)
  // The locked super role is only ever granted by another super administrator,
  // and the server refuses it either way.
  const assignable = useMemo(
    () => (roles ?? []).filter((r) => !r.isLocked || can("*")),
    [roles, can]
  )
  const [roleIds, setRoleIds] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    reset,
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
    if (open) setRoleIds((editing?.roles ?? []).map((r) => r.id))
  }, [open, editing, reset])

  // users.role still exists and still gates a few org-owner rules, so keep it
  // in step with the assigned roles rather than asking for it twice.
  const derivedLegacyRole: ManageableRole = assignable.some(
    (r) => r.key === "org_admin" && roleIds.includes(r.id)
  )
    ? "admin"
    : "user"

  const onSubmit = (values: CreateUserForm) => {
    const onError = (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : "Something went wrong")

    if (isEdit && editing) {
      update.mutate(
        {
          id: editing.id,
          payload: {
            firstName: values.firstName,
            lastName: values.lastName,
            role: derivedLegacyRole,
          },
        },
        {
          onError,
          onSuccess: () => {
            // Roles are written after the details: updating users.role re-syncs
            // the assignment from the legacy mapping, and this write is the one
            // that should win.
            if (!canAssign) {
              toast.success("User updated")
              onOpenChange(false)
              return
            }
            setUserRoles.mutate(
              { userId: editing.id, roleIds },
              {
                onError,
                onSuccess: () => {
                  toast.success("User updated")
                  onOpenChange(false)
                },
              }
            )
          },
        }
      )
    } else {
      create.mutate(
        { ...values, role: derivedLegacyRole, roleIds: canAssign ? roleIds : undefined },
        {
          onError,
          onSuccess: () => {
            toast.success("User added")
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
          {canAssign && (
            <div className="grid gap-1.5">
              <Label>Roles</Label>
              <p className="text-xs text-muted-foreground">
                What this person may do — the same roles you edit under Settings, Roles
                &amp; access.
              </p>
              <div className="mt-1 grid max-h-52 gap-2 overflow-y-auto rounded-md border p-3">
                {assignable.map((r) => {
                  const id = `assign-role-${r.id}`
                  return (
                    <div key={r.id} className="flex items-start gap-2.5">
                      <Checkbox
                        id={id}
                        checked={roleIds.includes(r.id)}
                        onCheckedChange={(v) =>
                          setRoleIds((prev) =>
                            v === true ? [...prev, r.id] : prev.filter((x) => x !== r.id)
                          )
                        }
                        className="mt-0.5"
                        data-cy={`assign-role-${r.key ?? r.id}`}
                      />
                      <Label
                        htmlFor={id}
                        className="flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal"
                      >
                        <span className="text-sm leading-tight">{r.name}</span>
                        <span className="text-[11px] leading-tight text-muted-foreground">
                          {r.isLocked ? "All permissions" : `${r.permissionCount} permissions`}
                        </span>
                      </Label>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} data-tour="create-user-submit-btn" data-cy="user-submit">
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Manage a client company's IT supporter accounts: list, add (creates a real
// TestMate it_support login and emails them credentials), remove.
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { FormField } from "@/components/shared/FormField"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useCreateSupporter, useRemoveSupporter, useSupporters } from "@/hooks/useClientCompanies"
import { createSupporterSchema, type CreateSupporterForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"
import type { ClientCompany, Supporter } from "@/types/clientCompany.types"

interface Props {
  company: ClientCompany | null
  onOpenChange: (open: boolean) => void
}

export function SupportersDialog({ company, onOpenChange }: Props) {
  const companyId = company?.id ?? ""
  const { data: supporters = [], isLoading } = useSupporters(companyId, Boolean(company))
  const createSupporter = useCreateSupporter(companyId)
  const removeSupporter = useRemoveSupporter(companyId)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Supporter | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateSupporterForm>({ resolver: zodResolver(createSupporterSchema) })

  const onSubmit = (values: CreateSupporterForm) => {
    createSupporter.mutate(values, {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
      onSuccess: () => {
        toast.success("Supporter added — their sign-in details have been emailed to them")
        reset()
        setAdding(false)
      },
    })
  }

  const initials = (name: string) =>
    name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"

  return (
    <Dialog open={Boolean(company)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>IT supporters — {company?.name}</DialogTitle>
          <DialogDescription>
            Supporter accounts sign in to TestMate and see only this company's ticket queue —
            they resolve what they can and escalate the rest to your team.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Loading supporters…</p>}
        {!isLoading && supporters.length === 0 && (
          <p className="text-sm text-muted-foreground">No supporter accounts yet.</p>
        )}

        <div className="space-y-1">
          {supporters.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{initials(s.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">{s.email}</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="size-7 p-0 text-destructive hover:text-destructive"
                onClick={() => setRemoving(s)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {adding ? (
          <form className="grid gap-3 rounded-md border p-3" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="sp-first" label="First name" error={errors.firstName?.message} {...register("firstName")} />
              <FormField id="sp-last" label="Last name" error={errors.lastName?.message} {...register("lastName")} />
            </div>
            <FormField id="sp-email" label="Email" type="email" error={errors.email?.message} {...register("email")} />
            <FormField
              id="sp-password"
              label="Temporary password"
              type="text"
              error={errors.password?.message}
              {...register("password")}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createSupporter.isPending}>
                {createSupporter.isPending ? "Adding…" : "Add supporter"}
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" className="justify-self-start" onClick={() => setAdding(true)}>
            <UserPlus className="mr-1 size-3.5" /> Add supporter
          </Button>
        )}

        <ConfirmDialog
          open={Boolean(removing)}
          onOpenChange={(o) => !o && setRemoving(null)}
          title="Remove supporter"
          description={`${removing?.name}'s account will be deactivated — they'll no longer be able to sign in.`}
          confirmLabel="Remove"
          loading={removeSupporter.isPending}
          onConfirm={() =>
            removing &&
            removeSupporter.mutate(removing.id, {
              onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
              onSuccess: () => {
                toast.success("Supporter removed")
                setRemoving(null)
              },
            })
          }
        />
      </DialogContent>
    </Dialog>
  )
}

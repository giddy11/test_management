import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Crown } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { FormField } from "@/components/shared/FormField"
import { useCreateProject, useUpdateProject, useProject } from "@/hooks/useProjects"
import { useUsers } from "@/hooks/useUsers"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types/auth.types"
import { projectSchema, type ProjectForm } from "@/lib/validation"
import { ApiError } from "@/transport/http"
import type { Project, ProjectMemberRole } from "@/types/project.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Project | null
}

export function ProjectFormDialog({ open, onOpenChange, editing }: Props) {
  const { user } = useAuth()
  const create = useCreateProject()
  const update = useUpdateProject()
  const isEdit = Boolean(editing)
  // The projects list doesn't include members — fetch the detail when editing.
  const { data: detail } = useProject(open && editing ? editing.id : "")
  const { data: usersData } = useUsers({ limit: 100 })
  // Admins already see every project; membership (and its roles) is for regular users.
  const candidates = (usersData?.data ?? []).filter(
    (u) => u.role === UserRole.USER && u.id !== user?.id
  )

  // userId -> project role for everyone currently picked as a member
  const [members, setMembers] = useState<Map<string, ProjectMemberRole>>(new Map())
  const [search, setSearch] = useState("")

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
      setSearch("")
      setMembers(new Map())
    }
  }, [open, editing, reset])

  // Seed the member picker once the edited project's detail (with members) arrives.
  useEffect(() => {
    if (open && isEdit && detail?.members) {
      setMembers(new Map(detail.members.map((m) => [m.id, m.role])))
    }
  }, [open, isEdit, detail])

  const toggleMember = (id: string) =>
    setMembers((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, "member")
      return next
    })

  const setRole = (id: string, role: ProjectMemberRole) =>
    setMembers((prev) => new Map(prev).set(id, role))

  const filtered = candidates.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const onSubmit = (values: ProjectForm) => {
    const memberList = [...members].map(([userId, role]) => ({ userId, role }))
    const payload = {
      name: values.name,
      description: values.description || undefined,
      // Always sent on edit so removals apply; on create only when someone is picked.
      ...(isEdit || memberList.length > 0 ? { members: memberList } : {}),
    }
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this project's details." : "Create a project to organise test suites."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <FormField id="name" label="Name" data-cy="project-name" error={errors.name?.message} {...register("name")} />
          <FormField id="description" label="Description (optional)" data-cy="project-description" {...register("description")} />

          <div className="space-y-2">
            <Label>Members</Label>
            <p className="text-xs text-muted-foreground">
              Members get this project's notifications and see the work assigned to them.
              A <span className="font-medium">team lead</span> sees every suite in the project.
            </p>
            <Input
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
              {filtered.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No users found.</p>
              )}
              {filtered.map((u) => {
                const initials = `${u.firstName?.[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase()
                const selected = members.has(u.id)
                const role = members.get(u.id)
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                  >
                    <Checkbox checked={selected} onCheckedChange={() => toggleMember(u.id)} />
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">{initials || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    {selected && (
                      <div className="grid shrink-0 grid-cols-2 gap-0.5 rounded-md bg-muted p-0.5">
                        <button
                          type="button"
                          onClick={() => setRole(u.id, "member")}
                          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            role === "member"
                              ? "bg-background shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Member
                        </button>
                        <button
                          type="button"
                          onClick={() => setRole(u.id, "team_lead")}
                          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            role === "team_lead"
                              ? "bg-background shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Lead
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {members.size > 0 && (
              <div className="flex flex-wrap gap-1">
                {[...members].map(([id, role]) => {
                  const u = candidates.find((c) => c.id === id) ?? detail?.members?.find((m) => m.id === id)
                  if (!u) return null
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 text-xs">
                      {role === "team_lead" && <Crown className="size-3 text-amber-500" />}
                      {u.name}
                      <button
                        type="button"
                        className="ml-0.5 rounded-full hover:text-destructive"
                        onClick={() => toggleMember(id)}
                      >
                        ×
                      </button>
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} data-tour="create-project-submit-btn" data-cy="project-submit">
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

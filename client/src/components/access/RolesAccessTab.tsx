// components/access/RolesAccessTab.tsx — the Roles & access settings tab.
//
// Left column: the roles, each with "N permissions · M members" so the impact
// of an edit is visible before making it, and a lock icon on the locked role.
// Right pane: the selected role's permission editor, one card per category.
//
// Everything here is a courtesy. The API re-checks every permission on every
// request — see the footer notice at the bottom of this file.
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Lock, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useAuth } from "@/contexts/AuthContext"
import {
  useCreateRole,
  useDeleteRole,
  usePermissionCatalog,
  useRoles,
  useUpdateRole,
} from "@/hooks/useAccess"
import { ApiError } from "@/transport/http"
import { cn } from "@/lib/utils"
import type { Permission, Role } from "@/types/access.types"

const BUILTIN_NOTE =
  "A built-in role. Its name is fixed, but you can still change what it may do."

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

// ── Role list (left column) ───────────────────────────────────────────────────

function RoleListItem({
  role,
  selected,
  onSelect,
}: {
  role: Role
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-cy={`role-item-${role.key ?? role.id}`}
      aria-current={selected}
      className={cn(
        "flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary bg-accent"
          : "border-transparent hover:bg-accent/60"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{role.name}</span>
          {role.isLocked && (
            <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Locked" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {role.isLocked ? "All permissions" : plural(role.permissionCount, "permission")} ·{" "}
          {plural(role.memberCount, "member")}
        </p>
      </div>
    </button>
  )
}

// ── Permission editor (right pane) ────────────────────────────────────────────

function PermissionCheckbox({
  permission,
  checked,
  disabled,
  onToggle,
}: {
  permission: Permission
  checked: boolean
  disabled: boolean
  onToggle: (next: boolean) => void
}) {
  const id = `perm-${permission.code}`
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onToggle(v === true)}
        className="mt-0.5"
        data-cy={`permission-${permission.code}`}
      />
      <Label htmlFor={id} className="flex-1 cursor-pointer flex-col items-start gap-0.5 font-normal">
        <span className="text-sm leading-tight">{permission.label}</span>
        <code className="font-mono text-[11px] leading-tight text-muted-foreground">
          {permission.code}
        </code>
        {permission.warning && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] leading-tight text-amber-600 dark:text-amber-500">
            <TriangleAlert className="size-3 shrink-0" />
            {permission.warning}
          </span>
        )}
      </Label>
    </div>
  )
}

function CategoryCard({
  label,
  description,
  permissions,
  selected,
  disabled,
  onChange,
}: {
  label: string
  description: string | null
  permissions: Permission[]
  selected: Set<string>
  disabled: boolean
  onChange: (codes: string[], next: boolean) => void
}) {
  const chosen = permissions.filter((p) => selected.has(p.code)).length
  const allChosen = chosen === permissions.length && permissions.length > 0

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{label}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              {chosen}/{permissions.length}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(permissions.map((p) => p.code), !allChosen)}
              data-cy={`toggle-category-${label}`}
            >
              {allChosen ? "Clear all" : "Select all"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {permissions.map((p) => (
          <PermissionCheckbox
            key={p.code}
            permission={p}
            checked={selected.has(p.code)}
            disabled={disabled}
            onToggle={(next) => onChange([p.code], next)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

// ── New role dialog ───────────────────────────────────────────────────────────

function NewRoleDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  roles: Role[]
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [cloneFromId, setCloneFromId] = useState<string>("none")
  const create = useCreateRole()

  useEffect(() => {
    if (open) {
      setName("")
      setDescription("")
      setCloneFromId("none")
    }
  }, [open])

  const submit = () => {
    create.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        // Cloning the locked super role is refused by the server; it isn't
        // offered here either.
        cloneFromId: cloneFromId === "none" ? undefined : cloneFromId,
      },
      {
        onSuccess: (role) => {
          toast.success(`Created "${role.name}"`)
          onOpenChange(false)
        },
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : "Could not create the role"),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-cy="new-role-dialog">
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            A custom role. You can change its name and permissions at any time, and delete it
            while it has no members.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Release manager"
              data-cy="new-role-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for."
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-clone">Start from</Label>
            <Select value={cloneFromId} onValueChange={setCloneFromId}>
              <SelectTrigger id="role-clone" data-cy="new-role-clone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No permissions</SelectItem>
                {roles
                  .filter((r) => !r.isLocked)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Copy of {r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={name.trim().length < 2 || create.isPending}
            data-cy="new-role-submit"
          >
            {create.isPending ? "Creating…" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── The tab ───────────────────────────────────────────────────────────────────

export function RolesAccessTab() {
  const { can } = useAuth()
  const canManage = can("role.manage")

  const { data: roles, isLoading: rolesLoading } = useRoles()
  const { data: catalog, isLoading: catalogLoading } = usePermissionCatalog()
  const update = useUpdateRole()
  const remove = useDeleteRole()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [newRoleOpen, setNewRoleOpen] = useState(false)
  const [deleting, setDeleting] = useState<Role | null>(null)

  const selected = useMemo(
    () => roles?.find((r) => r.id === selectedId) ?? roles?.[0] ?? null,
    [roles, selectedId]
  )

  // Reset the draft whenever the selection changes or the role is refetched.
  useEffect(() => {
    if (selected) setDraft(new Set(selected.permissions))
  }, [selected?.id, selected?.permissions])

  const byCategory = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of catalog?.permissions ?? []) {
      if (!map.has(p.category)) map.set(p.category, [])
      map.get(p.category)!.push(p)
    }
    return map
  }, [catalog])

  // The Save button stays disabled until something actually changes.
  const isDirty = useMemo(() => {
    if (!selected) return false
    if (draft.size !== selected.permissions.length) return true
    return selected.permissions.some((c) => !draft.has(c))
  }, [draft, selected])

  // The locked role is read-only for everyone, always.
  const editingDisabled = !canManage || !selected || selected.isLocked

  const toggle = (codes: string[], next: boolean) => {
    setDraft((prev) => {
      const copy = new Set(prev)
      for (const code of codes) {
        if (next) copy.add(code)
        else copy.delete(code)
      }
      return copy
    })
  }

  const save = () => {
    if (!selected) return
    update.mutate(
      { id: selected.id, permissions: [...draft] },
      {
        onSuccess: () => toast.success(`Saved "${selected.name}"`),
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : "Could not save the role"),
      }
    )
  }

  // Runs only from the confirmation dialog — the Delete button just opens it.
  const destroy = () => {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(`Deleted "${deleting.name}"`)
        setDeleting(null)
        setSelectedId(null)
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.message : "Could not delete the role"),
    })
  }

  if (rolesLoading || catalogLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        {/* Roles */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Roles</h2>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNewRoleOpen(true)}
                data-cy="new-role"
              >
                <Plus className="size-3.5" />
                New role
              </Button>
            )}
          </div>
          <div className="space-y-1" role="list">
            {(roles ?? []).map((role) => (
              <RoleListItem
                key={role.id}
                role={role}
                selected={selected?.id === role.id}
                onSelect={() => setSelectedId(role.id)}
              />
            ))}
          </div>
        </div>

        {/* Selected role */}
        {selected ? (
          <div className="space-y-4" data-cy="role-editor">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{selected.name}</h2>
                  {selected.isLocked && <Lock className="size-4 text-muted-foreground" />}
                  {selected.isBuiltin && <Badge variant="secondary">Built-in</Badge>}
                </div>
                {selected.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
                )}
                {selected.isBuiltin && !selected.isLocked && (
                  <p className="mt-1 text-xs text-muted-foreground">{BUILTIN_NOTE}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {plural(selected.memberCount, "member")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canManage && !selected.isBuiltin && selected.memberCount === 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setDeleting(selected)}
                    disabled={remove.isPending}
                    data-cy="delete-role"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                )}
                {!editingDisabled && (
                  <Button
                    onClick={save}
                    disabled={!isDirty || update.isPending}
                    data-cy="save-role"
                  >
                    {update.isPending ? "Saving…" : "Save role"}
                  </Button>
                )}
              </div>
            </div>

            {selected.isLocked ? (
              <Card>
                <CardContent className="flex items-start gap-3 py-6">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      This role holds every permission, including ones added later.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      It is locked and cannot be edited or deleted — by anyone, through any
                      route.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {(catalog?.categories ?? []).map((category) => {
                  const permissions = byCategory.get(category.key) ?? []
                  if (!permissions.length) return null
                  return (
                    <CategoryCard
                      key={category.key}
                      label={category.label}
                      description={category.description}
                      permissions={permissions}
                      selected={draft}
                      disabled={editingDisabled}
                      onChange={toggle}
                    />
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No roles yet.</p>
        )}
      </div>

      {/* The point of the whole page. */}
      <p className="border-t pt-4 text-xs text-muted-foreground">
        Roles are convenience; permissions are what the server actually checks. Hiding a
        control in this app is a courtesy, not a lock — the API re-checks every one of these
        permissions on every request.
      </p>

      <NewRoleDialog open={newRoleOpen} onOpenChange={setNewRoleOpen} roles={roles ?? []} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete role"
        description={`"${deleting?.name ?? "This role"}" will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={destroy}
      />
    </div>
  )
}

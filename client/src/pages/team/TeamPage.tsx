import { useState } from "react"
import { Plus, Pencil, UserX, Crown } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UserFormDialog } from "@/components/team/UserFormDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { InlineLoader } from "@/components/shared/PageLoader"
import { PresenceDot } from "@/components/shared/PresenceDot"
import { useUsers, useDeactivateUser } from "@/hooks/useUsers"
import { useAuth } from "@/contexts/AuthContext"
import { ROLE_LABEL } from "@/components/layout/nav"
import type { User } from "@/types/auth.types"

export default function TeamPage() {
  const { user: me } = useAuth()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [deactivating, setDeactivating] = useState<User | null>(null)

  const { data, isLoading, isError, error } = useUsers({ page, limit: 20, search: search || undefined })
  const deactivate = useDeactivateUser()

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (u: User) => {
    setEditing(u)
    setFormOpen(true)
  }

  const confirmDeactivate = () => {
    if (!deactivating) return
    deactivate.mutate(deactivating.id, {
      onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      onSuccess: () => {
        toast.success("User deactivated")
        setDeactivating(null)
      },
    })
  }

  const users = data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Manage users in your organisation.</p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto" data-tour="add-user-btn">
          <Plus className="mr-1 size-4" /> Add user
        </Button>
      </div>

      <Input
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => {
          setPage(1)
          setSearch(e.target.value)
        }}
        className="max-w-xs"
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="h-24">
                  <InlineLoader />
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-destructive">
                  {error instanceof Error ? error.message : "Failed to load users"}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No users yet. Add your first one.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <PresenceDot userId={u.id} className="ring-0" />
                    {u.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <Badge variant={u.role === "user" ? "secondary" : "default"}>
                      {ROLE_LABEL[u.role]}
                    </Badge>
                    {u.isOrgOwner && (
                      <Badge variant="outline" className="gap-1">
                        <Crown className="size-3 text-amber-500" /> Owner
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {/* The org owner can only be edited by themselves — hide edit for others. */}
                  {(!u.isOrgOwner || u.id === me?.id) && (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {/* The organisation owner can't be deactivated — hide the action. */}
                  {u.id !== me?.id && !u.isOrgOwner && (
                    <Button variant="ghost" size="sm" onClick={() => setDeactivating(u)}>
                      <UserX className="size-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={!data.meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <ConfirmDialog
        open={Boolean(deactivating)}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title="Deactivate user"
        description={`${deactivating?.name ?? "This user"} will lose access. This can be undone in the database.`}
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={confirmDeactivate}
      />
    </div>
  )
}

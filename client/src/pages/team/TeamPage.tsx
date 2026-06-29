import { useState } from "react"
import { Plus, Pencil, UserX } from "lucide-react"
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
        toast.success("Member deactivated")
        setDeactivating(null)
      },
    })
  }

  const users = data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Manage members of your organisation.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1 size-4" /> Add member
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
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-destructive">
                  {error instanceof Error ? error.message : "Failed to load members"}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isError && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No members yet. Add your first one.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "user" ? "secondary" : "default"}>
                    {ROLE_LABEL[u.role]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                    <Pencil className="size-4" />
                  </Button>
                  {u.id !== me?.id && (
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
        title="Deactivate member"
        description={`${deactivating?.name ?? "This member"} will lose access. This can be undone in the database.`}
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
        onConfirm={confirmDeactivate}
      />
    </div>
  )
}

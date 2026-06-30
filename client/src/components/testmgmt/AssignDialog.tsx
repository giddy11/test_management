import { useEffect, useState } from "react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useUsers } from "@/hooks/useUsers"
import { useAssignCase } from "@/hooks/useCases"
import { ApiError } from "@/transport/http"
import type { TestCase } from "@/types/testMgmt.types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  testCase: TestCase | null
}

export function AssignDialog({ open, onOpenChange, testCase }: Props) {
  const { data } = useUsers({ limit: 100 })
  const users = data?.data ?? []
  const assign = useAssignCase()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [deadline, setDeadline] = useState<string>("")

  useEffect(() => {
    if (open && testCase) {
      setSelected(new Set(testCase.assignees.map((a) => a.id)))
      setDeadline(testCase.deadline ?? "")
    }
    if (open) setSearch("")
  }, [open, testCase])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const filtered = users.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const save = () => {
    if (!testCase) return
    assign.mutate(
      {
        id: testCase.id,
        userIds: [...selected],
        deadline: deadline || null,
      },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => {
          toast.success("Assignees updated")
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign users</DialogTitle>
          <DialogDescription>
            Pick who is responsible for "{testCase?.title}". They'll see it under their tests.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-60 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>
          )}
          {filtered.map((u) => {
            const initials = `${u.firstName?.[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase()
            return (
              <label
                key={u.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">{initials || "U"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                </div>
              </label>
            )
          })}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="deadline">Deadline (optional)</Label>
          <Input
            id="deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={assign.isPending}>
            {assign.isPending ? "Saving…" : `Assign ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

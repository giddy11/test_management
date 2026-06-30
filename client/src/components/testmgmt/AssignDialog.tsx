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
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useUsers } from "@/hooks/useUsers"
import { useAssignCase, useBulkAssignCases } from "@/hooks/useCases"
import { ApiError } from "@/transport/http"
import type { TestCase } from "@/types/testMgmt.types"

// Single-case mode: pass testCase. Bulk mode: pass caseIds (array of IDs).
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  testCase?: TestCase | null   // single-case mode
  caseIds?: string[]           // bulk mode — takes priority when provided
}

export function AssignDialog({ open, onOpenChange, testCase, caseIds }: Props) {
  const isBulk = Boolean(caseIds && caseIds.length > 0)
  const { data } = useUsers({ limit: 100 })
  const users = data?.data ?? []
  const assign = useAssignCase()
  const bulkAssign = useBulkAssignCases()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [deadline, setDeadline] = useState<string>("")

  useEffect(() => {
    if (!open) return
    setSearch("")
    if (isBulk) {
      // In bulk mode start with no users pre-selected — each case may differ
      setSelected(new Set())
      setDeadline("")
    } else if (testCase) {
      setSelected(new Set(testCase.assignees.map((a) => a.id)))
      setDeadline(testCase.deadline ?? "")
    }
  }, [open, testCase, isBulk])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const filtered = users.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const isPending = assign.isPending || bulkAssign.isPending

  const save = () => {
    if (isBulk) {
      bulkAssign.mutate(
        { caseIds: caseIds!, userIds: [...selected], deadline: deadline || null },
        {
          onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
          onSuccess: ({ assigned }) => {
            toast.success(`Assigned users to ${assigned} test case${assigned === 1 ? "" : "s"}`)
            onOpenChange(false)
          },
        }
      )
    } else {
      if (!testCase) return
      assign.mutate(
        { id: testCase.id, userIds: [...selected], deadline: deadline || null },
        {
          onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
          onSuccess: () => {
            toast.success("Assignees updated")
            onOpenChange(false)
          },
        }
      )
    }
  }

  const caseCount = isBulk ? caseIds!.length : 1
  const title = isBulk ? `Assign users — ${caseCount} test cases` : "Assign users"
  const description = isBulk
    ? `The selected users will be set as assignees on all ${caseCount} test cases. Any existing assignments will be replaced.`
    : `Pick who is responsible for "${testCase?.title}". They'll see it under their tests.`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {isBulk && (
          <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            This will <strong>replace</strong> existing assignees on all {caseCount} selected cases.
          </div>
        )}

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

        {selected.size > 0 && (
          <div className="flex flex-wrap gap-1">
            {[...selected].map((id) => {
              const u = users.find((u) => u.id === id)
              if (!u) return null
              return (
                <Badge key={id} variant="secondary" className="gap-1 text-xs">
                  {u.name}
                  <button
                    className="ml-0.5 rounded-full hover:text-destructive"
                    onClick={() => toggle(id)}
                  >
                    ×
                  </button>
                </Badge>
              )
            })}
          </div>
        )}

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
          <Button onClick={save} disabled={isPending || selected.size === 0}>
            {isPending
              ? "Saving…"
              : isBulk
              ? `Assign to ${caseCount} case${caseCount === 1 ? "" : "s"}`
              : `Assign ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

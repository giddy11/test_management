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

// Single-case mode: pass testCase. Bulk mode: pass bulkCases (with existing assignees for merge).
interface BulkCase {
  id: string
  existingAssigneeIds: string[]
}
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  testCase?: TestCase | null   // single-case mode
  bulkCases?: BulkCase[]       // bulk mode — takes priority when provided
}

export function AssignDialog({ open, onOpenChange, testCase, bulkCases }: Props) {
  const isBulk = Boolean(bulkCases && bulkCases.length > 0)
  const { data, isError, error } = useUsers({ limit: 100 })
  const users = data?.data ?? []
  const assign = useAssignCase()
  const bulkAssign = useBulkAssignCases()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [deadline, setDeadline] = useState<string>("")
  const [mode, setMode] = useState<"add" | "remove">("add")

  useEffect(() => {
    if (!open) return
    setSearch("")
    setMode("add")
    if (isBulk) {
      // In bulk mode start with no users pre-selected — each case may differ
      setSelected(new Set())
      setDeadline("")
    } else if (testCase) {
      setSelected(new Set(testCase.assignees.map((a) => a.id)))
      setDeadline(testCase.deadline ?? "")
    }
  }, [open, testCase, isBulk])

  // Clear the picked users whenever the bulk add/remove mode flips — the two
  // modes list different users, so a carried-over selection would be misleading.
  useEffect(() => {
    if (isBulk) setSelected(new Set())
  }, [mode, isBulk])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Users currently assigned to at least one selected case — the only ones that
  // can be removed in bulk "remove" mode.
  const assignedIds = new Set((bulkCases ?? []).flatMap((c) => c.existingAssigneeIds))
  const isRemove = isBulk && mode === "remove"
  const pool = isRemove ? users.filter((u) => assignedIds.has(u.id)) : users
  const filtered = pool.filter((u) =>
    `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const isPending = assign.isPending || bulkAssign.isPending

  const save = () => {
    if (isBulk) {
      bulkAssign.mutate(
        { cases: bulkCases!, userIds: [...selected], deadline: isRemove ? undefined : deadline || null, mode },
        {
          onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
          onSuccess: ({ assigned }) => {
            toast.success(
              isRemove
                ? `Removed users from ${assigned} test case${assigned === 1 ? "" : "s"}`
                : `Assigned users to ${assigned} test case${assigned === 1 ? "" : "s"}`
            )
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

  const caseCount = isBulk ? bulkCases!.length : 1
  const title = isBulk ? `Manage assignees — ${caseCount} test cases` : "Assign users"
  const description = isBulk
    ? isRemove
      ? `The selected users will be removed from all ${caseCount} test cases.`
      : `The selected users will be added as assignees on all ${caseCount} test cases. Existing assignees are kept.`
    : `Pick who is responsible for "${testCase?.title}". They'll see it under their tests.`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {isBulk && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setMode("add")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "add" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Add users
            </button>
            <button
              type="button"
              onClick={() => setMode("remove")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "remove" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Remove users
            </button>
          </div>
        )}

        {isBulk && (
          <div
            className={
              isRemove
                ? "rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                : "rounded-md border border-blue-300/60 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
            }
          >
            {isRemove ? (
              <>Selected users will be <strong>removed</strong> from each case. Only users already assigned to the selection are shown.</>
            ) : (
              <>Selected users will be <strong>added</strong> to each case. Anyone already assigned stays assigned.</>
            )}
          </div>
        )}

        <Input
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-60 space-y-1 overflow-y-auto">
          {isError && (
            <p className="py-6 text-center text-sm text-destructive">
              {error instanceof ApiError ? error.message : "Failed to load users."}
            </p>
          )}
          {!isError && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {isRemove ? "No users are assigned to the selected cases." : "No users found."}
            </p>
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

        {!isRemove && (
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
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={save}
            disabled={isPending || selected.size === 0}
            variant={isRemove ? "destructive" : "default"}
          >
            {isPending
              ? "Saving…"
              : isRemove
              ? `Remove from ${caseCount} case${caseCount === 1 ? "" : "s"}`
              : isBulk
              ? `Add to ${caseCount} case${caseCount === 1 ? "" : "s"}`
              : `Assign ${selected.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

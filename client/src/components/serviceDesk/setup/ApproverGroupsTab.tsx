// components/serviceDesk/setup/ApproverGroupsTab.tsx — named sets of
// approvers ("Finance", "Security") and the highest risk each may approve.
// Policies name groups; any one member can satisfy a group's line in a step.
import { useState } from "react"
import { Pencil, Plus, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { RiskBadge } from "@/components/serviceDesk/RequestBits"
import { useApproverCandidates, useApproverGroups, useDeleteGroup, useSaveGroup } from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"
import { RISK_LEVELS, RISK_META, type ApproverGroup, type RiskLevel } from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong")

export function ApproverGroupsTab() {
  const { data: groups = [], isLoading } = useApproverGroups()
  const remove = useDeleteGroup()
  const [editing, setEditing] = useState<ApproverGroup | "new" | null>(null)
  const [deleting, setDeleting] = useState<ApproverGroup | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A group's <strong>authority</strong> is the highest risk it may approve. Asked about anything riskier, its members
          can't decide — the step goes to IT request administrators instead.
        </p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="mr-1 size-3.5" /> New group
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && groups.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No approver groups yet.</CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base"><Users className="size-4" /> {g.name}</CardTitle>
                {g.description && <CardDescription>{g.description}</CardDescription>}
              </div>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${g.name}`} onClick={() => setEditing(g)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${g.name}`} onClick={() => setDeleting(g)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <span className="text-muted-foreground">May approve up to</span> <RiskBadge value={g.maxRiskLevel} />
              </p>
              <p className="text-muted-foreground">
                {g.members.length ? g.members.map((m) => m.name).join(", ") : "No members yet — add some, or this group can't approve anything."}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <GroupDialog group={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="Requests already in progress keep their approvers. A group used by a policy can't be deleted."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, { onSuccess: () => { toast.success("Group deleted"); setDeleting(null) }, onError: fail })
        }
      />
    </div>
  )
}

function GroupDialog({ group, onClose }: { group: ApproverGroup | "new" | null; onClose: () => void }) {
  const existing = group && group !== "new" ? group : null
  const { data: candidates = [] } = useApproverCandidates(group !== null)
  const save = useSaveGroup()
  const [openedFor, setOpenedFor] = useState<ApproverGroup | "new" | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [maxRiskLevel, setMaxRiskLevel] = useState<RiskLevel>("medium")
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [search, setSearch] = useState("")

  if (group !== openedFor) {
    setOpenedFor(group)
    setName(existing?.name ?? "")
    setDescription(existing?.description ?? "")
    setMaxRiskLevel(existing?.maxRiskLevel ?? "medium")
    setMemberIds(existing?.members.map((m) => m.id) ?? [])
    setSearch("")
  }

  const shown = candidates.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <Dialog open={group !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit "${existing.name}"` : "New approver group"}</DialogTitle>
          <DialogDescription>Changes apply to requests submitted from now on.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="grp-name">Name</Label>
            <Input id="grp-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="grp-desc">Description</Label>
            <Textarea id="grp-desc" rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>May approve up to</Label>
            <Select value={maxRiskLevel} onValueChange={(v) => setMaxRiskLevel(v as RiskLevel)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RISK_LEVELS.map((r) => (
                  <SelectItem key={r} value={r}>{RISK_META[r].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Members</Label>
            <Input placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-48 overflow-y-auto rounded-md border p-2">
              {shown.map((c) => (
                <label key={c.id} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                  <Checkbox
                    checked={memberIds.includes(c.id)}
                    // An IT agent can't be newly added, only removed.
                    disabled={c.blocked && !memberIds.includes(c.id)}
                    onCheckedChange={(v) => setMemberIds((prev) => (v === true ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
                  />
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.email}</span>
                  {c.blocked && (
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      IT agent — kept out of approvals{memberIds.includes(c.id) ? ", untick to remove" : ""}
                    </span>
                  )}
                </label>
              ))}
              {shown.length === 0 && <p className="text-xs text-muted-foreground">No one matches.</p>}
            </div>
            <p className="text-xs text-muted-foreground">{memberIds.length} selected</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={save.isPending}
            onClick={() => {
              if (!name.trim()) return toast.error("Give the group a name")
              save.mutate(
                { id: existing?.id, name: name.trim(), description: description.trim() || null, maxRiskLevel, memberIds },
                { onSuccess: () => { toast.success(existing ? "Group saved" : "Group created"); onClose() }, onError: fail }
              )
            }}
          >
            {existing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

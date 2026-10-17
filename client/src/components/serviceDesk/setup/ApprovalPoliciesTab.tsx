// components/serviceDesk/setup/ApprovalPoliciesTab.tsx — reusable approval
// routes. A policy is ordered steps (one after another); each step lists
// approvers — a person, a group, or the requester's line manager — and needs
// any one of them, or one from each line ("all"). Catalog items in "policy"
// mode follow one. The server checks the same rules (domain/approvalPlan.ts).
import { useState } from "react"
import { ArrowDown, ArrowUp, Pencil, Plus, Route, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import {
  useApprovalPolicies,
  useApproverCandidates,
  useApproverGroups,
  useDeletePolicy,
  useSavePolicy,
} from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"
import type { ApprovalPolicy, ApproverGroup, ApproverRule, Person, PolicyStep, StepMode } from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : "Something went wrong")

function ruleLabel(rule: ApproverRule, groups: ApproverGroup[], people: Person[]): string {
  if (rule.type === "line_manager") return "Line manager"
  if (rule.type === "group") return groups.find((g) => g.id === rule.groupId)?.name ?? "Unknown group"
  return people.find((p) => p.id === rule.userId)?.name ?? "Unknown person"
}

const ruleKey = (r: ApproverRule) => (r.type === "line_manager" ? "lm" : r.type === "group" ? `g:${r.groupId}` : `u:${r.userId}`)

export function ApprovalPoliciesTab() {
  const { data: policies = [], isLoading } = useApprovalPolicies()
  const { data: groups = [] } = useApproverGroups()
  const { data: people = [] } = useApproverCandidates()
  const remove = useDeletePolicy()
  const [editing, setEditing] = useState<ApprovalPolicy | "new" | null>(null)
  const [deleting, setDeleting] = useState<ApprovalPolicy | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Steps run in order. Within a step everyone is asked at once. Any rejection ends the request. The requester never
          approves their own request; if a step ends up with nobody, IT request administrators decide.
        </p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="mr-1 size-3.5" /> New policy
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && policies.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No approval policies yet. Items can still use the simple "one step — any of these people" approval.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {policies.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base"><Route className="size-4" /> {p.name}</CardTitle>
                <CardDescription>
                  {p.description ? `${p.description} · ` : ""}used by {p.itemCount} item{p.itemCount === 1 ? "" : "s"}
                </CardDescription>
              </div>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1.5 text-sm">
                {p.steps.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{i + 1}. {s.name || `Step ${i + 1}`}</span>{" "}
                    <span className="text-muted-foreground">
                      — {s.mode === "all" ? "all of" : "any of"}: {s.approvers.map((a) => ruleLabel(a, groups, people)).join(", ")}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>

      <PolicyDialog policy={editing} groups={groups} people={people} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="A policy used by catalog items can't be deleted — point those items at another policy first."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, { onSuccess: () => { toast.success("Policy deleted"); setDeleting(null) }, onError: fail })
        }
      />
    </div>
  )
}

function PolicyDialog({
  policy,
  groups,
  people,
  onClose,
}: {
  policy: ApprovalPolicy | "new" | null
  groups: ApproverGroup[]
  people: Person[]
  onClose: () => void
}) {
  const existing = policy && policy !== "new" ? policy : null
  const save = useSavePolicy()
  const [openedFor, setOpenedFor] = useState<ApprovalPolicy | "new" | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [steps, setSteps] = useState<PolicyStep[]>([])

  if (policy !== openedFor) {
    setOpenedFor(policy)
    setName(existing?.name ?? "")
    setDescription(existing?.description ?? "")
    setSteps(existing?.steps.map((s) => ({ ...s, approvers: [...s.approvers] })) ?? [{ name: "", mode: "any", approvers: [] }])
  }

  const patch = (i: number, p: Partial<PolicyStep>) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const move = (i: number, by: -1 | 1) =>
    setSteps((prev) => {
      const next = [...prev]
      const j = i + by
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const submit = () => {
    if (!name.trim()) return toast.error("Give the policy a name")
    const empty = steps.findIndex((s) => s.approvers.length === 0)
    if (empty >= 0) return toast.error(`Step ${empty + 1} needs at least one approver`)
    save.mutate(
      { id: existing?.id, name: name.trim(), description: description.trim() || null, steps: steps.map((s) => ({ ...s, name: s.name.trim() })) },
      { onSuccess: () => { toast.success(existing ? "Policy saved" : "Policy created"); onClose() }, onError: fail }
    )
  }

  return (
    <Dialog open={policy !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit "${existing.name}"` : "New approval policy"}</DialogTitle>
          <DialogDescription>Requests already submitted keep the route they started with.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pol-name">Name</Label>
              <Input id="pol-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Manager then Finance" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pol-desc">Description</Label>
              <Input id="pol-desc" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          {steps.map((s, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Step {i + 1}</Badge>
                <Input className="h-8 flex-1" placeholder={`Step ${i + 1} name (e.g. Line manager)`} value={s.name} maxLength={80} onChange={(e) => patch(i, { name: e.target.value })} />
                <Select value={s.mode} onValueChange={(v) => patch(i, { mode: v as StepMode })}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any one of them</SelectItem>
                    <SelectItem value="all">One from each line</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move step up"><ArrowUp className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move step down"><ArrowDown className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" disabled={steps.length === 1} onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove step"><Trash2 className="size-4" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {s.approvers.map((a) => (
                  <Badge key={ruleKey(a)} variant="outline" className="gap-1 py-1">
                    {ruleLabel(a, groups, people)}
                    <button
                      type="button"
                      aria-label="Remove approver"
                      onClick={() => patch(i, { approvers: s.approvers.filter((x) => ruleKey(x) !== ruleKey(a)) })}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                {s.approvers.length === 0 && <span className="text-xs text-muted-foreground">No approvers yet</span>}
              </div>
              <AddApprover
                taken={new Set(s.approvers.map(ruleKey))}
                groups={groups}
                people={people}
                onAdd={(rule) => patch(i, { approvers: [...s.approvers, rule] })}
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-self-start"
            disabled={steps.length >= 10}
            onClick={() => setSteps((prev) => [...prev, { name: "", mode: "any", approvers: [] }])}
          >
            <Plus className="mr-1 size-3.5" /> Add a step
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={submit}>{existing ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddApprover({
  taken,
  groups,
  people,
  onAdd,
}: {
  taken: Set<string>
  groups: ApproverGroup[]
  people: Person[]
  onAdd: (rule: ApproverRule) => void
}) {
  // Reset to the placeholder after each pick.
  const [value, setValue] = useState("")
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        setValue("")
        if (v === "lm") onAdd({ type: "line_manager" })
        else if (v.startsWith("g:")) onAdd({ type: "group", groupId: v.slice(2) })
        else if (v.startsWith("u:")) onAdd({ type: "user", userId: v.slice(2) })
      }}
    >
      <SelectTrigger className="h-8 w-full sm:w-72"><SelectValue placeholder="+ Add an approver" /></SelectTrigger>
      <SelectContent>
        {!taken.has("lm") && <SelectItem value="lm">The requester's line manager</SelectItem>}
        {groups.filter((g) => !taken.has(`g:${g.id}`)).map((g) => (
          <SelectItem key={g.id} value={`g:${g.id}`}>Group: {g.name}</SelectItem>
        ))}
        {people.filter((p) => !taken.has(`u:${p.id}`)).map((p) => (
          <SelectItem key={p.id} value={`u:${p.id}`}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

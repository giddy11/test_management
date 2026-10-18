// components/serviceDesk/setup/ApprovalPoliciesTab.tsx — reusable approval
// routes. A policy is ordered steps (one after another); each step lists
// approvers — a person, a group, or the requester's line manager — and needs
// any one of them, or one from each line ("all"). Catalog items in "policy"
// mode follow one. The server checks the same rules (domain/approvalPlan.ts).
import { useState } from "react"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Pencil, Plus, Route, Trash2, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
  useServiceDeskSettings,
  useUpdateApprovalRules,
} from "@/hooks/useServiceDesk"
import { cn } from "@/lib/utils"
import { ApiError } from "@/transport/http"
import type { ApprovalPolicy, ApproverGroup, ApproverRule, Person, PolicyStep, StepMode } from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : "Something went wrong")

function ruleLabel(rule: ApproverRule, groups: ApproverGroup[], people: Person[]): string {
  if (rule.type === "line_manager") return "Line manager"
  if (rule.type === "group") return groups.find((g) => g.id === rule.groupId)?.name ?? "Unknown group"
  const person = people.find((p) => p.id === rule.userId)
  return person ? `${person.name}${person.blocked ? " (IT agent, skipped)" : ""}` : "Unknown person"
}

// An IT agent the organisation keeps out of approvals: still named, never asked.
const isBlocked = (rule: ApproverRule, people: Person[]) => rule.type === "user" && !!people.find((p) => p.id === rule.userId)?.blocked

// "a, b and c"
const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`)

// What a step's mode means for the approvers actually listed, in plain words.
function modeHint(mode: StepMode, rules: ApproverRule[], groups: ApproverGroup[], people: Person[]): string {
  if (rules.length === 0) return "Add the people or groups who decide this step."
  if (rules.length === 1) return "With just one approver listed, all the options work the same: this step is done when they approve."
  if (mode === "any") {
    return `Done as soon as any one of them approves: ${listOf(rules.map((r) => ruleLabel(r, groups, people)))}. The others don't need to.`
  }
  const parts = rules.map((r) => (r.type === "group" ? `one member of ${ruleLabel(r, groups, people)}` : r.type === "line_manager" ? "the requester's line manager" : ruleLabel(r, groups, people)))
  if (mode === "order") {
    return `Asked one at a time, in the order listed: ${parts.join(", then ")}. Each is only asked once the one before has approved, so nobody can approve out of turn.${rules.some((r) => r.type === "group") ? " A group counts as soon as any one of its members approves." : ""}`
  }
  return `Done only when all of these have approved: ${listOf(parts)}.${rules.some((r) => r.type === "group") ? " A group counts as soon as any one of its members approves." : ""}`
}

const ruleKey = (r: ApproverRule) => (r.type === "line_manager" ? "lm" : r.type === "group" ? `g:${r.groupId}` : `u:${r.userId}`)

export function ApprovalPoliciesTab() {
  const { data: policies = [], isLoading } = useApprovalPolicies()
  const { data: groups = [] } = useApproverGroups()
  const { data: people = [] } = useApproverCandidates()
  const remove = useDeletePolicy()
  const { data: settings } = useServiceDeskSettings()
  const setRules = useUpdateApprovalRules()
  const [editing, setEditing] = useState<ApprovalPolicy | "new" | null>(null)
  const [deleting, setDeleting] = useState<ApprovalPolicy | null>(null)
  const agentsOut = settings?.agentsCannotApprove ?? true

  // Policies and groups that still name an IT agent, who will be skipped.
  const blockedIds = new Set(people.filter((p) => p.blocked).map((p) => p.id))
  const stillNaming = [
    ...policies.filter((p) => p.steps.some((s) => s.approvers.some((a) => a.type === "user" && blockedIds.has(a.userId)))).map((p) => `policy "${p.name}"`),
    ...groups.filter((g) => g.members.some((m) => blockedIds.has(m.id))).map((g) => `group "${g.name}"`),
  ]

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 py-4">
          <label className="flex items-start gap-3">
            <Checkbox
              className="mt-0.5"
              checked={agentsOut}
              disabled={!settings || setRules.isPending}
              onCheckedChange={(v) =>
                setRules.mutate({ agentsCannotApprove: v === true }, {
                  onSuccess: () => toast.success(v === true ? "IT agents can no longer approve" : "IT agents can approve again"),
                  onError: fail,
                })
              }
              data-cy="agents-cannot-approve"
            />
            <span className="text-sm">
              <span className="font-medium">IT agents can&apos;t approve requests</span>
              <span className="block text-muted-foreground">
                The people who fulfil requests can&apos;t also approve them. Administrators and IT leads still can. Applies to new
                requests.
              </span>
            </span>
          </label>
          {agentsOut && stillNaming.length > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/70 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Still naming IT agents, who will be skipped: {stillNaming.join(", ")}. Edit them to take the agents out.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Steps run in order. Within a step, approvers are asked all at once or one at a time, as each step is set. Any rejection ends the request. The requester never
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
                      — {s.mode === "order" ? "in order" : s.mode === "all" ? "all of" : "any of"}: {s.approvers.map((a) => ruleLabel(a, groups, people)).join(", ")}
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
  // Who is asked first matters in a "one after another" step.
  const moveApprover = (i: number, k: number, by: -1 | 1) =>
    setSteps((prev) =>
      prev.map((s, j) => {
        if (j !== i) return s
        const approvers = [...s.approvers]
        const to = k + by
        if (to < 0 || to >= approvers.length) return s
        ;[approvers[k], approvers[to]] = [approvers[to], approvers[k]]
        return { ...s, approvers }
      })
    )
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
          <DialogDescription>
            Steps run one after another. Within a step, approvers are asked all at once, or one at a time if you choose that, and a rejection from anyone rejects the
            request. Requests already submitted keep the route they started with.
          </DialogDescription>
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
                    <SelectItem value="any">Any one approves</SelectItem>
                    <SelectItem value="all">Each one approves</SelectItem>
                    <SelectItem value="order">One after another</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move step up"><ArrowUp className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move step down"><ArrowDown className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" disabled={steps.length === 1} onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove step"><Trash2 className="size-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground" data-cy="step-mode-hint">{modeHint(s.mode, s.approvers, groups, people)}</p>
              <div className="flex flex-wrap gap-1.5">
                {s.approvers.map((a, k) => (
                  <Badge
                    key={ruleKey(a)}
                    variant="outline"
                    className={cn("gap-1 py-1", isBlocked(a, people) && "border-amber-400 text-amber-700 dark:text-amber-400")}
                    title={isBlocked(a, people) ? "An IT agent: skipped while IT agents are kept out of approvals. Remove them to save." : undefined}
                  >
                    {s.mode === "order" && <span className="text-muted-foreground">{k + 1}.</span>}
                    {ruleLabel(a, groups, people)}
                    {s.mode === "order" && k > 0 && (
                      <button type="button" aria-label="Ask earlier" title="Ask earlier" onClick={() => moveApprover(i, k, -1)}>
                        <ChevronLeft className="size-3" />
                      </button>
                    )}
                    {s.mode === "order" && k < s.approvers.length - 1 && (
                      <button type="button" aria-label="Ask later" title="Ask later" onClick={() => moveApprover(i, k, 1)}>
                        <ChevronRight className="size-3" />
                      </button>
                    )}
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
        {people.filter((p) => !p.blocked && !taken.has(`u:${p.id}`)).map((p) => (
          <SelectItem key={p.id} value={`u:${p.id}`}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

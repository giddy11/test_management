// components/serviceDesk/setup/AutomationRules.tsx — "when a request looks
// like this, do that." Rules run once at submit, lowest order first; every
// matching rule applies. A rule can never add or remove an approval step —
// except automatic approval, which also needs the item to allow it and only
// ever applies to low-risk, non-privileged items without an identity check.
// The server re-checks all of it (domain/automationRules.ts).
import { useState } from "react"
import { FlaskConical, Pencil, Plus, Trash2, Wand2, Zap } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useAdminCatalog, useAutomationRules, useDeleteRule, useDryRun, useSaveRule, useServiceAgents } from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"
import { cn } from "@/lib/utils"
import {
  PRIORITY_META,
  REQUEST_PRIORITIES,
  RISK_LEVELS,
  RISK_META,
  type AutomationRule,
  type DryRunResult,
  type RuleActions,
  type RuleConditions,
} from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : "Something went wrong")

const EMPTY_CONDITIONS: RuleConditions = {
  categoryKeys: [],
  itemIds: [],
  priorities: [],
  riskLevels: [],
  forNewStarter: null,
  answers: [],
  textContains: "",
}
const EMPTY_ACTIONS: RuleActions = { setPriority: null, assignToId: null, flagForReview: "", internalNote: "", autoApprove: false }

function describe(rule: AutomationRule, names: { categories: Map<string, string>; items: Map<string, string>; agents: Map<string, string> }) {
  const c = rule.conditions
  const when: string[] = []
  if (c.categoryKeys.length) when.push(`category is ${c.categoryKeys.map((k) => names.categories.get(k) ?? k).join(" or ")}`)
  if (c.itemIds.length) when.push(`item is ${c.itemIds.map((i) => names.items.get(i) ?? "a deleted item").join(" or ")}`)
  if (c.priorities.length) when.push(`priority is ${c.priorities.join(" or ")}`)
  if (c.riskLevels.length) when.push(`risk is ${c.riskLevels.join(" or ")}`)
  if (c.forNewStarter !== null) when.push(c.forNewStarter ? "it's for a new starter" : "it's not for a new starter")
  for (const a of c.answers) when.push(`"${a.key}" is ${JSON.stringify(a.value)}`)
  if (c.textContains) when.push(`text mentions "${c.textContains}"`)
  const a = rule.actions
  const then: string[] = []
  if (a.setPriority) then.push(`set priority to ${a.setPriority}`)
  if (a.assignToId) then.push(`assign to ${names.agents.get(a.assignToId) ?? "an IT agent"}`)
  if (a.flagForReview) then.push(`flag for review ("${a.flagForReview}")`)
  if (a.internalNote) then.push("add an internal note")
  if (a.autoApprove) then.push("approve automatically (where allowed)")
  return { when: when.length ? when.join(", and ") : "any request", then: then.join(", ") }
}

export function AutomationRules() {
  const { data: rules = [], isLoading } = useAutomationRules()
  const { data: catalog = [] } = useAdminCatalog()
  const { data: agents = [] } = useServiceAgents()
  const save = useSaveRule()
  const remove = useDeleteRule()
  const [editing, setEditing] = useState<AutomationRule | "new" | null>(null)
  const [deleting, setDeleting] = useState<AutomationRule | null>(null)

  const names = {
    categories: new Map(catalog.map((c) => [c.key, c.name])),
    items: new Map(catalog.flatMap((c) => c.items.map((i) => [i.id, i.name] as const))),
    agents: new Map(agents.map((a) => [a.id, a.name])),
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Rules run once, when a request is submitted, in order. Every matching rule applies; if two set the same thing, the later one wins.
          Rules never add or remove approval steps — automatic approval also needs the item to allow it.
        </p>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 size-3.5" /> New rule</Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && rules.length === 0 && (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">No rules yet.</CardContent></Card>
      )}
      <div className="space-y-2">
        {rules.map((r) => {
          const d = describe(r, names)
          return (
            <Card key={r.id} className={cn(!r.isActive && "opacity-60")}>
              <CardContent className="flex flex-wrap items-start gap-3 py-3">
                <Badge variant="outline" className="mt-0.5 tabular-nums">{r.sortOrder}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <Zap className="size-3.5 text-primary" /> {r.name}
                    {!r.isActive && <Badge variant="outline">Off</Badge>}
                    {r.actions.autoApprove && <Badge className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Approves automatically</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground"><strong className="font-medium text-foreground">When</strong> {d.when} <strong className="font-medium text-foreground">then</strong> {d.then}.</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => save.mutate({ id: r.id, isActive: !r.isActive }, { onSuccess: () => toast.success(r.isActive ? "Rule switched off" : "Rule switched on"), onError: fail })}
                  >
                    {r.isActive ? "Switch off" : "Switch on"}
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil className="size-3.5" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}><Trash2 className="size-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <RuleDialog rule={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="Requests it already applied to keep their history. It won't run on new requests."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { toast.success("Rule deleted"); setDeleting(null) }, onError: fail })}
      />
    </div>
  )
}

function Chips<T extends string>({ values, selected, onChange, label }: { values: readonly T[]; selected: T[]; onChange: (v: T[]) => void; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => {
        const on = selected.includes(v)
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(on ? selected.filter((x) => x !== v) : [...selected, v])}
            className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
            aria-pressed={on}
          >
            {label(v)}
          </button>
        )
      })}
    </div>
  )
}

function RuleDialog({ rule, onClose }: { rule: AutomationRule | "new" | null; onClose: () => void }) {
  const existing = rule && rule !== "new" ? rule : null
  const { data: catalog = [] } = useAdminCatalog()
  const { data: agents = [] } = useServiceAgents(rule !== null)
  const save = useSaveRule()
  const dryRun = useDryRun()
  const [openedFor, setOpenedFor] = useState<AutomationRule | "new" | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [sortOrder, setSortOrder] = useState("100")
  const [isActive, setIsActive] = useState(true)
  const [c, setC] = useState<RuleConditions>(EMPTY_CONDITIONS)
  const [a, setA] = useState<RuleActions>(EMPTY_ACTIONS)
  const [result, setResult] = useState<DryRunResult | null>(null)

  if (rule !== openedFor) {
    setOpenedFor(rule)
    setName(existing?.name ?? "")
    setDescription(existing?.description ?? "")
    setSortOrder(String(existing?.sortOrder ?? 100))
    setIsActive(existing?.isActive ?? true)
    setC({ ...EMPTY_CONDITIONS, ...(existing?.conditions ?? {}) })
    setA({ ...EMPTY_ACTIONS, ...(existing?.actions ?? {}) })
    setResult(null)
  }

  const items = catalog.flatMap((cat) => cat.items.map((i) => ({ ...i, categoryName: cat.name })))
  const hasAction = !!(a.setPriority || a.assignToId || a.flagForReview.trim() || a.internalNote.trim() || a.autoApprove)
  const cleanAnswers = c.answers.filter((x) => x.key.trim())

  const submit = () => {
    if (!name.trim()) return toast.error("Give the rule a name")
    if (!hasAction) return toast.error("A rule needs at least one action")
    save.mutate(
      {
        id: existing?.id,
        name: name.trim(),
        description: description.trim() || null,
        sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)),
        isActive,
        conditions: { ...c, answers: cleanAnswers, textContains: c.textContains.trim() },
        actions: { ...a, flagForReview: a.flagForReview.trim(), internalNote: a.internalNote.trim() },
      },
      { onSuccess: () => { toast.success(existing ? "Rule saved" : "Rule created"); onClose() }, onError: fail }
    )
  }

  return (
    <Dialog open={rule !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit "${existing.name}"` : "New automation rule"}</DialogTitle>
          <DialogDescription>Applies to requests submitted from now on.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cloud spend over budget needs a look" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-order">Order</Label>
              <Input id="rule-order" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
          </div>
          <Textarea rows={2} placeholder="Why this rule exists (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />

          <section className="grid gap-3 rounded-md border p-3">
            <p className="text-sm font-medium">When a request… <span className="font-normal text-muted-foreground">(leave a condition empty to ignore it)</span></p>
            <div className="grid gap-1.5">
              <Label className="text-xs font-normal">is in one of these categories</Label>
              <Chips values={catalog.map((x) => x.key)} selected={c.categoryKeys} onChange={(v) => setC({ ...c, categoryKeys: v })} label={(k) => catalog.find((x) => x.key === k)?.name ?? k} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-normal">is for one of these items</Label>
              <div className="max-h-32 overflow-y-auto rounded-md border p-2">
                {items.map((i) => (
                  <label key={i.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <Checkbox
                      checked={c.itemIds.includes(i.id)}
                      onCheckedChange={(on) => setC({ ...c, itemIds: on === true ? [...c.itemIds, i.id] : c.itemIds.filter((x) => x !== i.id) })}
                    />
                    {i.name} <span className="text-xs text-muted-foreground">{i.categoryName}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-normal">has priority</Label>
                <Chips values={REQUEST_PRIORITIES} selected={c.priorities} onChange={(v) => setC({ ...c, priorities: v })} label={(p) => PRIORITY_META[p].label} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-normal">has risk</Label>
                <Chips values={RISK_LEVELS} selected={c.riskLevels} onChange={(v) => setC({ ...c, riskLevels: v })} label={(r) => RISK_META[r].label.replace(" risk", "")} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-normal">is for a new starter</Label>
                <Select value={c.forNewStarter === null ? "any" : c.forNewStarter ? "yes" : "no"} onValueChange={(v) => setC({ ...c, forNewStarter: v === "any" ? null : v === "yes" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Doesn't matter</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-normal">mentions (title or details)</Label>
                <Input value={c.textContains} maxLength={100} onChange={(e) => setC({ ...c, textContains: e.target.value })} placeholder="e.g. production" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-normal">has these answers <span className="text-muted-foreground">(the question's key from the item's form, and the answer)</span></Label>
              {c.answers.map((ans, i) => (
                <div key={i} className="flex gap-2">
                  <Input className="font-mono text-xs" placeholder="key, e.g. access_level" value={ans.key} onChange={(e) => setC({ ...c, answers: c.answers.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} />
                  <Input placeholder="answer, e.g. Administrator" value={String(ans.value)} onChange={(e) => setC({ ...c, answers: c.answers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                  <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setC({ ...c, answers: c.answers.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="justify-self-start" disabled={c.answers.length >= 10} onClick={() => setC({ ...c, answers: [...c.answers, { key: "", value: "" }] })}>
                <Plus className="mr-1 size-3.5" /> Add an answer condition
              </Button>
            </div>
          </section>

          <section className="grid gap-3 rounded-md border p-3">
            <p className="text-sm font-medium">…then</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-normal">Set priority</Label>
                <Select value={a.setPriority ?? "keep"} onValueChange={(v) => setA({ ...a, setPriority: v === "keep" ? null : (v as RuleActions["setPriority"]) })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Leave as the requester set it</SelectItem>
                    {REQUEST_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-normal">Assign to</Label>
                <Select value={a.assignToId ?? "nobody"} onValueChange={(v) => setA({ ...a, assignToId: v === "nobody" ? null : v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nobody">Don't assign</SelectItem>
                    {agents.map((ag) => <SelectItem key={ag.id} value={ag.id}>{ag.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-normal">Flag for review, with this reason (IT sees it; blocks automatic approval and fulfilment)</Label>
              <Input value={a.flagForReview} maxLength={300} onChange={(e) => setA({ ...a, flagForReview: e.target.value })} placeholder="e.g. Production access — check with the platform team" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-normal">Add an internal note (IT only)</Label>
              <Textarea rows={2} value={a.internalNote} maxLength={2000} onChange={(e) => setA({ ...a, internalNote: e.target.value })} />
            </div>
            <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <Checkbox className="mt-0.5" checked={a.autoApprove} onCheckedChange={(v) => setA({ ...a, autoApprove: v === true })} />
              <span>
                Approve automatically
                <span className="block text-xs text-muted-foreground">
                  Only when the item allows it, is low-risk, isn't privileged, needs no identity check, and no rule flagged the request. Otherwise it goes to its approvers as normal — and the reason is recorded.
                </span>
              </span>
            </label>
          </section>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} /> Rule is on
          </label>

          <section className="grid gap-2">
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              disabled={!hasAction || dryRun.isPending}
              onClick={() =>
                dryRun.mutate(
                  { conditions: { ...c, answers: cleanAnswers }, actions: { ...a, flagForReview: a.flagForReview.trim(), internalNote: a.internalNote.trim() } },
                  { onSuccess: setResult, onError: fail }
                )
              }
            >
              <FlaskConical className="mr-1 size-3.5" /> Try it on the last 50 requests
            </Button>
            {result && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">Would have matched {result.matched} of the last {result.checked} requests.</p>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">
                  {result.matches.map((m) => (
                    <li key={m.id}>
                      <span className="font-mono text-muted-foreground">{m.reference}</span> {m.title} <span className="text-muted-foreground">· {m.item}</span>
                      {m.wouldAutoApprove === true && <Badge className="ml-1 border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">would auto-approve</Badge>}
                      {m.wouldAutoApprove === false && <span className="ml-1 text-muted-foreground">(not auto-approved: {m.autoApproveRefusal})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending}><Wand2 className="mr-1 size-3.5" /> {existing ? "Save rule" : "Create rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AutomationIntro() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How automation works</CardTitle>
        <CardDescription>
          Rules shape requests as they're submitted. Connectors fulfil approved requests in other systems and report back. Every automated step is recorded in the run log and on the request — and nothing automation does can skip a required approval.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

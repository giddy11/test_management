// components/serviceDesk/ItemEditorDialog.tsx — add or edit one catalog
// item: what it is, its form, who approves it, and IT's private notes on
// fulfilling it. The server re-validates the form definition
// (domain/formSchema.ts) — rules here only save a round trip.
import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DynamicFormFields } from "@/components/serviceDesk/DynamicFormFields"
import { useApprovalPolicies, useApproverCandidates, useCreateItem, useUpdateItem } from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type AdminCategory,
  type AdminItem,
  RISK_LEVELS,
  RISK_META,
  type RiskLevel,
  type ApprovalMode,
  type FieldType,
  type FormField,
  type FormValue,
  type FormValues,
} from "@/types/serviceDesk.types"

// A field while it's being edited: options as one-per-line text. The answer
// key is never typed: a new question's key follows its label (kept unique),
// and once the item has been saved it's locked — answers already given are
// stored under it, so renaming one would orphan them.
interface DraftField {
  uid: string
  key: string
  keyLocked: boolean
  label: string
  type: FieldType
  required: boolean
  optionsText: string
  helpText: string
}

const toKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1")
    .slice(0, 40) || "field"

// `base`, or base_2, base_3… — whichever no other question uses.
function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `_${n}`
    const candidate = `${base.slice(0, 40 - suffix.length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

let uidSeq = 0
const uid = () => `f${++uidSeq}`

const toDraft = (f: FormField): DraftField => ({
  uid: uid(),
  key: f.key,
  keyLocked: true,
  label: f.label,
  type: f.type,
  required: f.required,
  optionsText: (f.options ?? []).join("\n"),
  helpText: f.helpText ?? "",
})

const isChoice = (t: FieldType) => t === "select" || t === "multiselect"

// Blank or invalid = use the organisation's default.
const hoursOrNull = (v: string) => {
  const n = Math.round(Number(v))
  return v.trim() && Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 90) : null
}

function toField(d: DraftField): FormField {
  const options = d.optionsText.split("\n").map((o) => o.trim()).filter(Boolean)
  return {
    key: d.key,
    label: d.label.trim(),
    type: d.type,
    required: d.type === "checkbox" ? false : d.required,
    ...(isChoice(d.type) ? { options } : {}),
    helpText: d.helpText.trim() || null,
  }
}

function problemsOf(fields: DraftField[]): string[] {
  const out: string[] = []
  const keys = new Set<string>()
  fields.forEach((d, i) => {
    const n = `Field ${i + 1}`
    if (!d.label.trim()) out.push(`${n} needs a label`)
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(d.key)) out.push(`${n}'s key must be lowercase letters, numbers and underscores`)
    if (keys.has(d.key)) out.push(`Two fields share the key "${d.key}"`)
    keys.add(d.key)
    if (isChoice(d.type)) {
      const opts = d.optionsText.split("\n").map((o) => o.trim()).filter(Boolean)
      if (!opts.length) out.push(`${n} needs at least one option`)
      if (new Set(opts).size !== opts.length) out.push(`${n} has a duplicate option`)
    }
  })
  return out
}

export function ItemEditorDialog({
  open,
  onOpenChange,
  categories,
  item,
  defaultCategoryId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: AdminCategory[]
  item: AdminItem | null // null = new
  defaultCategoryId?: string
}) {
  const { data: candidates = [] } = useApproverCandidates(open)
  const create = useCreateItem()
  const update = useUpdateItem()

  const [name, setName] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [description, setDescription] = useState("")
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("none")
  const [approverIds, setApproverIds] = useState<string[]>([])
  const [approverSearch, setApproverSearch] = useState("")
  const [fulfilmentNotes, setFulfilmentNotes] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [approvalPolicyId, setApprovalPolicyId] = useState("")
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low")
  const [approvalHours, setApprovalHours] = useState("")
  const [fulfilmentHours, setFulfilmentHours] = useState("")
  const { data: policies = [] } = useApprovalPolicies(open)
  const [requiresIdentityCheck, setRequiresIdentityCheck] = useState(false)
  const [fields, setFields] = useState<DraftField[]>([])
  const [preview, setPreview] = useState(false)
  const [previewValues, setPreviewValues] = useState<FormValues>({})

  useEffect(() => {
    if (!open) return
    setName(item?.name ?? "")
    setCategoryId(item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "")
    setDescription(item?.description ?? "")
    setApprovalMode(item?.approvalMode ?? "none")
    setApproverIds(item?.approvers.map((a) => a.id) ?? [])
    setApproverSearch("")
    setFulfilmentNotes(item?.fulfilmentNotes ?? "")
    setIsActive(item?.isActive ?? true)
    setApprovalPolicyId(item?.approvalPolicyId ?? "")
    setRiskLevel(item?.riskLevel ?? "low")
    setApprovalHours(item?.approvalHours ? String(item.approvalHours) : "")
    setFulfilmentHours(item?.fulfilmentHours ? String(item.fulfilmentHours) : "")
    setRequiresIdentityCheck(item?.requiresIdentityCheck ?? false)
    setFields((item?.formSchema ?? []).map(toDraft))
    setPreview(false)
    setPreviewValues({})
  }, [open, item, defaultCategoryId, categories])

  const patchField = (u: string, patch: Partial<DraftField>) =>
    setFields((prev) =>
      prev.map((f) => {
        if (f.uid !== u) return f
        const next = { ...f, ...patch }
        if (patch.label !== undefined && !f.keyLocked) {
          const taken = new Set(prev.filter((x) => x.uid !== u).map((x) => x.key))
          next.key = uniqueKey(toKey(patch.label), taken)
        }
        return next
      })
    )
  const move = (i: number, by: -1 | 1) =>
    setFields((prev) => {
      const next = [...prev]
      const j = i + by
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const problems = useMemo(() => problemsOf(fields), [fields])
  const shownCandidates = candidates.filter((c) =>
    `${c.name} ${c.email}`.toLowerCase().includes(approverSearch.trim().toLowerCase())
  )
  const busy = create.isPending || update.isPending

  const save = async () => {
    if (!name.trim()) return toast.error("Give the item a name")
    if (!categoryId) return toast.error("Pick a category")
    if (problems.length) return toast.error(problems[0])
    if (approvalMode === "policy" && !approvalPolicyId) return toast.error("Pick the approval policy this item follows")
    const payload = {
      categoryId,
      name: name.trim(),
      description: description.trim() || null,
      formSchema: fields.map(toField),
      approvalMode,
      approverIds: approvalMode === "approvers" ? approverIds : [],
      approvalPolicyId: approvalMode === "policy" ? approvalPolicyId || null : null,
      riskLevel,
      approvalHours: hoursOrNull(approvalHours),
      fulfilmentHours: hoursOrNull(fulfilmentHours),
      requiresIdentityCheck,
      fulfilmentNotes: fulfilmentNotes.trim() || null,
      isActive,
    }
    try {
      if (item) await update.mutateAsync({ id: item.id, ...payload })
      else await create.mutateAsync(payload)
      toast.success(item ? "Item saved" : "Item added")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : "Couldn't save the item")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item ? `Edit "${item.name}"` : "Add a catalog item"}</DialogTitle>
          <DialogDescription>
            Something people can ask IT for. Requests already submitted keep the version they were raised against.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="item-name">Name</Label>
              <Input id="item-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Adobe Acrobat licence" />
            </div>
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.isActive ? "" : " (hidden)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="item-description">Description</Label>
            <Textarea id="item-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown to people on the request portal" />
          </div>

          {/* Approval */}
          <section className="grid gap-2 rounded-md border p-3">
            <Label>Approval</Label>
            <Select value={approvalMode} onValueChange={(v) => setApprovalMode(v as ApprovalMode)}>
              <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No approval — straight to IT</SelectItem>
                <SelectItem value="approvers">One step — any of these people</SelectItem>
                <SelectItem value="policy">An approval policy (several steps, groups, line manager)</SelectItem>
              </SelectContent>
            </Select>
            {approvalMode === "policy" && (
              <div className="grid gap-1.5">
                <Select value={approvalPolicyId} onValueChange={setApprovalPolicyId}>
                  <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Choose a policy" /></SelectTrigger>
                  <SelectContent>
                    {policies.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.steps.length} step{p.steps.length === 1 ? "" : "s"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {policies.length === 0 && (
                  <p className="text-xs text-muted-foreground">No policies yet — create one on the Approval policies tab.</p>
                )}
              </div>
            )}
            {approvalMode === "approvers" && (
              <div className="grid gap-2">
                <p className="text-xs text-muted-foreground">
                  Any one of these people can approve. If you pick nobody, the decision goes to whoever can set up IT
                  requests. Nobody ever approves their own request.
                </p>
                <Input placeholder="Search people" value={approverSearch} onChange={(e) => setApproverSearch(e.target.value)} />
                <div className="max-h-40 overflow-y-auto rounded-md border p-2">
                  {shownCandidates.length === 0 && <p className="text-xs text-muted-foreground">No one matches.</p>}
                  {shownCandidates.map((c) => (
                    <label key={c.id} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                      <Checkbox
                        checked={approverIds.includes(c.id)}
                        // An IT agent can't be newly picked, only removed.
                        disabled={c.blocked && !approverIds.includes(c.id)}
                        onCheckedChange={(v) =>
                          setApproverIds((prev) => (v === true ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                        }
                      />
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.email}</span>
                      {c.blocked && (
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          IT agent — kept out of approvals{approverIds.includes(c.id) ? ", untick to remove" : ""}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{approverIds.length} selected</p>
              </div>
            )}
            <div className="grid gap-1.5 border-t pt-3 sm:max-w-xs">
              <Label>Risk</Label>
              <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as RiskLevel)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((r) => (
                    <SelectItem key={r} value={r}>{RISK_META[r].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Approver groups can only approve up to their own risk level — use this for privileged access and costly resources.
              </p>
            </div>
          </section>

          {/* Service levels */}
          <section className="grid gap-2 rounded-md border p-3">
            <Label>Service levels (optional)</Label>
            <p className="text-xs text-muted-foreground">Leave blank to use the organisation's defaults from the Service levels tab.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="item-approval-hours" className="text-xs font-normal">Hours per approval step</Label>
                <Input id="item-approval-hours" type="number" min={1} value={approvalHours} onChange={(e) => setApprovalHours(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-fulfilment-hours" className="text-xs font-normal">Hours to fulfil (any priority)</Label>
                <Input id="item-fulfilment-hours" type="number" min={1} value={fulfilmentHours} onChange={(e) => setFulfilmentHours(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Identity check */}
          <section className="rounded-md border p-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={requiresIdentityCheck} onCheckedChange={(v) => setRequiresIdentityCheck(v === true)} />
              <span>
                Requires an identity check
                <span className="block text-xs text-muted-foreground">IT must record how they confirmed who's asking before any work starts (e.g. password resets).</span>
              </span>
            </label>
          </section>

          {/* Form builder */}
          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Form</Label>
                <p className="text-xs text-muted-foreground">
                  Questions people answer for this item. Title, details, justification and priority are always asked.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setPreview((p) => !p)}>
                <Eye className="mr-1 size-3.5" /> {preview ? "Edit form" : "Preview"}
              </Button>
            </div>

            {preview ? (
              <div className="rounded-md border p-4">
                {fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No extra questions.</p>
                ) : (
                  <DynamicFormFields
                    fields={fields.map(toField)}
                    values={previewValues}
                    onChange={(k: string, v: FormValue | undefined) =>
                      setPreviewValues((p) => {
                        const n = { ...p }
                        if (v === undefined) delete n[k]
                        else n[k] = v
                        return n
                      })
                    }
                  />
                )}
              </div>
            ) : (
              <>
                {fields.map((f, i) => (
                  <div key={f.uid} className="grid gap-2 rounded-md border p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                      <Input placeholder="Question" value={f.label} onChange={(e) => patchField(f.uid, { label: e.target.value })} />
                      <Select value={f.type} onValueChange={(v) => patchField(f.uid, { type: v as FieldType })}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-1">
                        <Button type="button" size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setFields((prev) => prev.filter((x) => x.uid !== f.uid))}
                          aria-label="Remove field"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    {isChoice(f.type) && (
                      <Textarea
                        rows={3}
                        placeholder="Options, one per line"
                        value={f.optionsText}
                        onChange={(e) => patchField(f.uid, { optionsText: e.target.value })}
                      />
                    )}
                    <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto] sm:items-center">
                      <Input placeholder="Help text (optional)" value={f.helpText} onChange={(e) => patchField(f.uid, { helpText: e.target.value })} />
                      <Input
                        readOnly
                        tabIndex={-1}
                        className="cursor-default bg-muted font-mono text-xs text-muted-foreground focus-visible:ring-0"
                        aria-label="Answer key (read-only)"
                        title="Answer key — the name this answer is stored under. Set from the question; it can't be edited."
                        value={f.key}
                      />
                      {f.type !== "checkbox" && (
                        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                          <Checkbox checked={f.required} onCheckedChange={(v) => patchField(f.uid, { required: v === true })} />
                          Required
                        </label>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Answer key</span> — what the answer is stored under
                      (e.g. <code className="rounded bg-muted px-1">{f.key}</code>). People filling in the form never see it.{" "}
                      {f.keyLocked
                        ? "It's fixed, so answers already given keep their meaning — reword the question freely."
                        : "It's made from the question as you type, and fixed once you save."}
                    </p>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="justify-self-start"
                  disabled={fields.length >= 30}
                  onClick={() =>
                    setFields((prev) => [
                      ...prev,
                      {
                        uid: uid(),
                        key: uniqueKey(`field_${prev.length + 1}`, new Set(prev.map((x) => x.key))),
                        keyLocked: false,
                        label: "",
                        type: "text",
                        required: false,
                        optionsText: "",
                        helpText: "",
                      },
                    ])
                  }
                >
                  <Plus className="mr-1 size-3.5" /> Add a question
                </Button>
                {problems.length > 0 && <p className="text-xs text-destructive">{problems[0]}</p>}
              </>
            )}
          </section>

          <div className="grid gap-1.5">
            <Label htmlFor="item-notes">How IT fulfils this (IT only)</Label>
            <Textarea
              id="item-notes"
              rows={3}
              value={fulfilmentNotes}
              onChange={(e) => setFulfilmentNotes(e.target.value)}
              placeholder="Steps, links or checks for whoever picks this up. Requesters never see this."
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
            Show on the request portal
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{item ? "Save" : "Add item"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// components/serviceDesk/setup/ServiceLevelsTab.tsx — how long approval and
// fulfilment may take, and how lateness escalates. Items may override the
// hours; time spent waiting for the requester never counts.
import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useServiceAgents, useApproverCandidates, useServiceDeskSettings, useUpdateServiceLevels } from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"
import { PRIORITY_META, REQUEST_PRIORITIES, type RequestPriority, type ServiceLevels } from "@/types/serviceDesk.types"

export function ServiceLevelsTab() {
  const { data: settings } = useServiceDeskSettings()
  if (!settings) return <p className="text-sm text-muted-foreground">Loading…</p>
  return <ServiceLevelsForm initial={settings.serviceLevels} />
}

function ServiceLevelsForm({ initial }: { initial: ServiceLevels }) {
  const save = useUpdateServiceLevels()
  const { data: agents = [] } = useServiceAgents()
  const { data: approvers = [] } = useApproverCandidates()
  const [approvalHours, setApprovalHours] = useState(String(initial.approvalHours))
  const [fulfilment, setFulfilment] = useState<Record<RequestPriority, string>>(
    Object.fromEntries(REQUEST_PRIORITIES.map((p) => [p, String(initial.fulfilmentHours[p])])) as Record<RequestPriority, string>
  )
  const [level2, setLevel2] = useState(String(initial.escalation.level2Pct))
  const [level3, setLevel3] = useState(String(initial.escalation.level3Pct))
  const [contactIds, setContactIds] = useState<string[]>(initial.escalation.contactIds)

  // Anyone in IT requests can be told about escalations.
  const people = [...new Map([...agents, ...approvers].map((p) => [p.id, p])).values()].sort((a, b) => a.name.localeCompare(b.name))

  const int = (v: string) => Math.round(Number(v))
  const submit = () => {
    const levels: ServiceLevels = {
      approvalHours: int(approvalHours),
      fulfilmentHours: Object.fromEntries(REQUEST_PRIORITIES.map((p) => [p, int(fulfilment[p])])) as Record<RequestPriority, number>,
      escalation: { level2Pct: int(level2), level3Pct: int(level3), contactIds },
    }
    const hours = [levels.approvalHours, ...Object.values(levels.fulfilmentHours)]
    if (hours.some((h) => !Number.isFinite(h) || h < 1)) return toast.error("Every target needs at least 1 hour")
    if (!(levels.escalation.level3Pct > levels.escalation.level2Pct)) return toast.error("The third escalation must come after the second")
    save.mutate(levels, {
      onSuccess: () => toast.success("Service levels saved — they apply to requests from now on"),
      onError: (e) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : "Couldn't save"),
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Targets</CardTitle>
          <CardDescription>A catalog item can set its own hours instead.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="sl-approval">Hours for each approval step</Label>
            <Input id="sl-approval" type="number" min={1} value={approvalHours} onChange={(e) => setApprovalHours(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Hours to fulfil, from reaching IT, by priority</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {REQUEST_PRIORITIES.map((p) => (
                <div key={p} className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{PRIORITY_META[p].label}</span>
                  <Input type="number" min={1} value={fulfilment[p]} onChange={(e) => setFulfilment((f) => ({ ...f, [p]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Escalation</CardTitle>
          <CardDescription>
            At the due time, whoever is holding the request up is reminded. Later, the contacts below hear about it — twice.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="sl-l2" className="text-xs font-normal">Second escalation, % of the target past due</Label>
              <Input id="sl-l2" type="number" min={1} value={level2} onChange={(e) => setLevel2(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="sl-l3" className="text-xs font-normal">Third (critical), % of the target past due</Label>
              <Input id="sl-l3" type="number" min={1} value={level3} onChange={(e) => setLevel3(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Example: a 24-hour target with 50% and 100% escalates at 24h (reminder), 36h and 48h.
          </p>
          <div className="grid gap-1.5">
            <Label>Escalation contacts</Label>
            <div className="max-h-44 overflow-y-auto rounded-md border p-2">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
                  <Checkbox
                    checked={contactIds.includes(p.id)}
                    onCheckedChange={(v) => setContactIds((prev) => (v === true ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
                  />
                  {p.name} <span className="text-xs text-muted-foreground">{p.email}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {contactIds.length ? `${contactIds.length} selected.` : "None selected — IT request administrators are told."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="lg:col-span-2">
        <Button onClick={submit} disabled={save.isPending}>Save service levels</Button>
      </div>
    </div>
  )
}

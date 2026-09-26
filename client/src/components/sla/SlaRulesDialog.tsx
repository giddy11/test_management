// components/sla/SlaRulesDialog.tsx — the organisation's SLA rules: response
// and resolution targets per source (tickets by severity, bugs by priority,
// feature requests as a single target), plus which stages pause the clock.
// Bugs and feature requests follow the ticket targets until given their own.
// Read-only for non-admins (they can still see what they're measured against).
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Info, PauseCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useSlaSettings, useUpdateSlaSettings } from "@/hooks/useSla"
import { ApiError } from "@/transport/http"
import {
  SLA_ALL_STAGES,
  SLA_SEVERITY_KEY_LABELS,
  SLA_STAGE_LABELS,
  type SlaBugTargets,
  type SlaSeverityKey,
  type SlaSource,
  type SlaTarget,
  type SlaTargets,
} from "@/types/sla.types"
import { fmtHours } from "./slaFormat"

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>
}

type BugKey = Exclude<SlaSeverityKey, "default">

const TICKET_KEYS: SlaSeverityKey[] = ["critical", "high", "medium", "low", "default"]
const BUG_KEYS: BugKey[] = ["critical", "high", "medium", "low"]
// Bugs are judged by priority; Urgent is what maps to the "critical" target.
const BUG_KEY_LABELS: Record<BugKey, string> = {
  critical: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
}

// An issue's very first stage (tickets: "logged", bugs: "Open", feature
// requests: "new") can't pause — nothing has happened yet, so pausing there
// would hide the very wait the SLA measures.
const PAUSABLE_STAGES = SLA_ALL_STAGES.filter((s) => !["logged", "Open", "new"].includes(s))

// Inputs hold text while editing, so a half-typed number isn't rewritten.
type Row = { firstResponseHours: string; resolutionHours: string }

function toRow(t: SlaTarget): Row {
  return { firstResponseHours: String(t.firstResponseHours), resolutionHours: String(t.resolutionHours) }
}

function toRows<K extends string>(targets: Record<K, SlaTarget>, keys: K[]): Record<K, Row> {
  return Object.fromEntries(keys.map((k) => [k, toRow(targets[k])])) as Record<K, Row>
}

function parseRow(row: Row, label: string): SlaTarget | null {
  const fr = Number(row.firstResponseHours)
  const rs = Number(row.resolutionHours)
  if (!Number.isFinite(fr) || fr <= 0 || !Number.isFinite(rs) || rs <= 0) {
    toast.error(`Enter positive hour values for ${label}`)
    return null
  }
  return { firstResponseHours: fr, resolutionHours: rs }
}

function HoursInput({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0.25}
        step={0.25}
        className="w-28"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-xs text-muted-foreground">{Number(value) > 0 ? fmtHours(Number(value)) : ""}</span>
    </div>
  )
}

function TargetTable({ firstColumn, children }: { firstColumn: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">{firstColumn}</th>
            <th className="pb-2 font-medium">First response (hours)</th>
            <th className="pb-2 font-medium">Resolution (hours)</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function TargetRow({
  label,
  hint,
  row,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  row: Row
  disabled: boolean
  onChange: (row: Row) => void
}) {
  return (
    <tr className="border-t">
      <td className="py-2 pr-3 font-medium">
        {label}
        {hint && <div className="text-xs font-normal text-muted-foreground">{hint}</div>}
      </td>
      <td className="py-2 pr-3">
        <HoursInput
          value={row.firstResponseHours}
          disabled={disabled}
          onChange={(v) => onChange({ ...row, firstResponseHours: v })}
        />
      </td>
      <td className="py-2">
        <HoursInput
          value={row.resolutionHours}
          disabled={disabled}
          onChange={(v) => onChange({ ...row, resolutionHours: v })}
        />
      </td>
    </tr>
  )
}

// "Use the ticket targets" toggle shared by the bug and feature-request tabs.
function FollowTicketsToggle({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean
  disabled: boolean
  onChange: (follow: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5 rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={(c) => onChange(Boolean(c))} />
        Use the ticket targets
      </label>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  )
}

export function SlaRulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: settings, isLoading } = useSlaSettings(open)
  const update = useUpdateSlaSettings()
  const [tab, setTab] = useState<SlaSource>("ticket")
  const [tickets, setTickets] = useState<Record<SlaSeverityKey, Row> | null>(null)
  // null = follows the ticket targets.
  const [bugs, setBugs] = useState<Record<BugKey, Row> | null>(null)
  const [featureRequest, setFeatureRequest] = useState<Row | null>(null)
  const [paused, setPaused] = useState<string[]>([])

  useEffect(() => {
    if (settings && open) {
      setTickets(toRows(settings.targets, TICKET_KEYS))
      setBugs(settings.separateBugTargets ? toRows(settings.bugTargets, BUG_KEYS) : null)
      setFeatureRequest(settings.separateFeatureRequestTarget ? toRow(settings.featureRequestTarget) : null)
      setPaused(settings.pausedStatuses)
      setTab("ticket")
    }
  }, [settings, open])

  const canEdit = settings?.canEdit ?? false

  // Switches to the tab holding the bad value so the error toast points at it.
  const save = () => {
    if (!tickets) return

    const targets = {} as SlaTargets
    for (const k of TICKET_KEYS) {
      const t = parseRow(tickets[k], SLA_SEVERITY_KEY_LABELS[k])
      if (!t) return setTab("ticket")
      targets[k] = t
    }

    let bugTargets: SlaBugTargets | null = null
    if (bugs) {
      const out = {} as SlaBugTargets
      for (const k of BUG_KEYS) {
        const t = parseRow(bugs[k], `bugs · ${BUG_KEY_LABELS[k]}`)
        if (!t) return setTab("bug")
        out[k] = t
      }
      bugTargets = out
    }

    let featureRequestTarget: SlaTarget | null = null
    if (featureRequest) {
      const t = parseRow(featureRequest, "feature requests")
      if (!t) return setTab("feature_request")
      featureRequestTarget = t
    }

    update.mutate(
      { targets, bugTargets, featureRequestTarget, pausedStatuses: paused },
      {
        onSuccess: () => {
          toast.success("SLA rules saved — every issue is re-judged against them")
          onOpenChange(false)
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the SLA rules"),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            SLA rules
            {settings?.isDefault && <Badge variant="secondary">Defaults</Badge>}
          </DialogTitle>
          <DialogDescription>
            The targets every ticket, bug and feature request on the SLA dashboard is measured against.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !tickets ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading rules…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex gap-2.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <ul className="list-disc space-y-1.5 pl-4">
                <li>
                  <Strong>First response</Strong> — the time allowed from an issue being created to its
                  first staff reply or status change. Going over it marks a <Strong>response breach</Strong>.
                </li>
                <li>
                  <Strong>Resolution</Strong> — the time allowed from creation until the issue is
                  resolved (tickets: Resolved; bugs: Fixed, Verified or Closed; feature requests: Done or
                  Rejected), minus any time spent in a paused stage (below). Going over it marks a{" "}
                  <Strong>resolution breach</Strong>.
                </li>
                <li>
                  Each source has its own tab. <Strong>Bugs</Strong> and <Strong>feature requests</Strong>{" "}
                  follow the ticket targets until you give them their own — a bug team and a support desk
                  rarely need the same turnaround.
                </li>
                <li>Saving re-judges every issue — including past ones — against the new numbers.</li>
              </ul>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as SlaSource)}>
              <TabsList>
                <TabsTrigger value="ticket" data-cy="sla-rules-tab-ticket">Tickets</TabsTrigger>
                <TabsTrigger value="bug" data-cy="sla-rules-tab-bug">
                  Bugs
                  {bugs && <span className="size-1.5 rounded-full bg-primary" title="Has its own targets" />}
                </TabsTrigger>
                <TabsTrigger value="feature_request" data-cy="sla-rules-tab-feature">
                  Feature requests
                  {featureRequest && <span className="size-1.5 rounded-full bg-primary" title="Has its own target" />}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ticket" className="mt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  A ticket's severity is set by IT support when they escalate it to the product team. Tickets
                  without one — not yet escalated, or submitted directly — use the{" "}
                  <Strong>No severity (default)</Strong> row.
                </p>
                <TargetTable firstColumn="Severity">
                  {TICKET_KEYS.map((k) => (
                    <TargetRow
                      key={k}
                      label={SLA_SEVERITY_KEY_LABELS[k]}
                      hint={k === "default" ? "Unescalated tickets" : undefined}
                      row={tickets[k]}
                      disabled={!canEdit}
                      onChange={(row) => setTickets({ ...tickets, [k]: row })}
                    />
                  ))}
                </TargetTable>
              </TabsContent>

              <TabsContent value="bug" className="mt-4 space-y-3">
                <FollowTicketsToggle
                  checked={bugs === null}
                  disabled={!canEdit}
                  onChange={(follow) =>
                    setBugs(
                      follow
                        ? null
                        : (Object.fromEntries(BUG_KEYS.map((k) => [k, tickets[k]])) as Record<BugKey, Row>)
                    )
                  }
                >
                  A bug is measured by its priority, matched to the ticket severity of the same name
                  (Urgent counts as Critical). Untick to set targets just for bugs.
                </FollowTicketsToggle>
                {bugs && (
                  <TargetTable firstColumn="Bug priority">
                    {BUG_KEYS.map((k) => (
                      <TargetRow
                        key={k}
                        label={BUG_KEY_LABELS[k]}
                        row={bugs[k]}
                        disabled={!canEdit}
                        onChange={(row) => setBugs({ ...bugs, [k]: row })}
                      />
                    ))}
                  </TargetTable>
                )}
              </TabsContent>

              <TabsContent value="feature_request" className="mt-4 space-y-3">
                <FollowTicketsToggle
                  checked={featureRequest === null}
                  disabled={!canEdit}
                  onChange={(follow) => setFeatureRequest(follow ? null : tickets.default)}
                >
                  Feature requests carry no severity, so they share one target. By default that's the ticket
                  "No severity (default)" row. Untick to set a target just for feature requests.
                </FollowTicketsToggle>
                {featureRequest && (
                  <TargetTable firstColumn="Applies to">
                    <TargetRow
                      label="All feature requests"
                      row={featureRequest}
                      disabled={!canEdit}
                      onChange={setFeatureRequest}
                    />
                  </TargetTable>
                )}
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <PauseCircle className="size-3.5 text-muted-foreground" />
                Pause the SLA clock while an issue is…
              </Label>
              <p className="text-xs text-muted-foreground">
                Time spent in a checked stage doesn't count toward the resolution target — e.g. tick{" "}
                <Strong>Resolved</Strong> so the wait for someone to formally close it isn't held
                against you. Applies to tickets, bugs, and feature requests alike. Nothing checked
                (the default) means the clock runs continuously from creation to resolution.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PAUSABLE_STAGES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={paused.includes(s)}
                      disabled={!canEdit}
                      onCheckedChange={(c) =>
                        setPaused((prev) => (c ? [...new Set([...prev, s])] : prev.filter((x) => x !== s)))
                      }
                    />
                    {SLA_STAGE_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button onClick={save} disabled={update.isPending || !tickets}>
              {update.isPending ? "Saving…" : "Save rules"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

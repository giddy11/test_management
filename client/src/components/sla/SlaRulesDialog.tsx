// components/sla/SlaRulesDialog.tsx — the organisation's SLA rules: response
// and resolution targets per severity, plus which stages pause the clock.
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
import { useSlaSettings, useUpdateSlaSettings } from "@/hooks/useSla"
import { ApiError } from "@/transport/http"
import {
  SLA_SEVERITY_KEY_LABELS,
  SLA_STAGES,
  SLA_STAGE_LABELS,
  type SlaSeverityKey,
  type SlaTargets,
} from "@/types/sla.types"
import { fmtHours } from "./slaFormat"

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>
}

const SEVERITY_KEYS: SlaSeverityKey[] = ["critical", "high", "medium", "low", "default"]

// Pausing at "logged" would hide the very wait the SLA measures.
const PAUSABLE_STAGES = SLA_STAGES.filter((s) => s !== "logged")

type Draft = Record<SlaSeverityKey, { firstResponseHours: string; resolutionHours: string }>

function toDraft(targets: SlaTargets): Draft {
  return Object.fromEntries(
    SEVERITY_KEYS.map((k) => [
      k,
      {
        firstResponseHours: String(targets[k].firstResponseHours),
        resolutionHours: String(targets[k].resolutionHours),
      },
    ])
  ) as Draft
}

export function SlaRulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: settings, isLoading } = useSlaSettings(open)
  const update = useUpdateSlaSettings()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [paused, setPaused] = useState<string[]>([])

  useEffect(() => {
    if (settings && open) {
      setDraft(toDraft(settings.targets))
      setPaused(settings.pausedStatuses)
    }
  }, [settings, open])

  const canEdit = settings?.canEdit ?? false

  const parse = (): SlaTargets | null => {
    if (!draft) return null
    const out = {} as SlaTargets
    for (const k of SEVERITY_KEYS) {
      const fr = Number(draft[k].firstResponseHours)
      const rs = Number(draft[k].resolutionHours)
      if (!Number.isFinite(fr) || fr <= 0 || !Number.isFinite(rs) || rs <= 0) {
        toast.error(`Enter positive hour values for ${SLA_SEVERITY_KEY_LABELS[k]}`)
        return null
      }
      out[k] = { firstResponseHours: fr, resolutionHours: rs }
    }
    return out
  }

  const save = () => {
    const targets = parse()
    if (!targets) return
    update.mutate(
      { targets, pausedStatuses: paused },
      {
        onSuccess: () => {
          toast.success("SLA rules saved — every ticket is re-judged against them")
          onOpenChange(false)
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the SLA rules"),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            SLA rules
            {settings?.isDefault && <Badge variant="secondary">Defaults</Badge>}
          </DialogTitle>
          <DialogDescription>
            The targets every ticket on the SLA dashboard is measured against.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !draft ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading rules…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex gap-2.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <ul className="list-disc space-y-1.5 pl-4">
                <li>
                  <Strong>First response</Strong> — the time allowed from a ticket being created to the
                  first staff reply or stage change. Going over it marks a <Strong>response breach</Strong>.
                </li>
                <li>
                  <Strong>Resolution</Strong> — the time allowed from creation until the ticket is
                  resolved, minus any time spent in a paused stage (below). Going over it marks a{" "}
                  <Strong>resolution breach</Strong>.
                </li>
                <li>
                  <Strong>Severity</Strong> is set by IT support when they escalate a ticket to the
                  product team — a ticket with no severity yet (still in the IT queue, or submitted
                  directly) is measured against the <Strong>No severity (default)</Strong> row instead.
                </li>
                <li>Saving re-judges every ticket — including past ones — against the new numbers.</li>
              </ul>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Severity</th>
                    <th className="pb-2 font-medium">First response (hours)</th>
                    <th className="pb-2 font-medium">Resolution (hours)</th>
                  </tr>
                </thead>
                <tbody>
                  {SEVERITY_KEYS.map((k) => (
                    <tr key={k} className="border-t">
                      <td className="py-2 pr-3 font-medium">
                        {SLA_SEVERITY_KEY_LABELS[k]}
                        {k === "default" && (
                          <div className="text-xs font-normal text-muted-foreground">
                            Not yet escalated / no severity set
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0.25}
                            step={0.25}
                            className="w-28"
                            value={draft[k].firstResponseHours}
                            disabled={!canEdit}
                            onChange={(e) =>
                              setDraft({ ...draft, [k]: { ...draft[k], firstResponseHours: e.target.value } })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {Number(draft[k].firstResponseHours) > 0 ? fmtHours(Number(draft[k].firstResponseHours)) : ""}
                          </span>
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0.25}
                            step={0.25}
                            className="w-28"
                            value={draft[k].resolutionHours}
                            disabled={!canEdit}
                            onChange={(e) =>
                              setDraft({ ...draft, [k]: { ...draft[k], resolutionHours: e.target.value } })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            {Number(draft[k].resolutionHours) > 0 ? fmtHours(Number(draft[k].resolutionHours)) : ""}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <PauseCircle className="size-3.5 text-muted-foreground" />
                Pause the SLA clock while a ticket is…
              </Label>
              <p className="text-xs text-muted-foreground">
                Time spent in a checked stage doesn't count toward the resolution target — e.g. tick{" "}
                <Strong>Resolved</Strong> so the wait for someone to formally close the ticket isn't
                held against you. Applies to both the IT support and product team timelines. Nothing
                checked (the default) means the clock runs continuously from creation to resolution.
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
            <Button onClick={save} disabled={update.isPending || !draft}>
              {update.isPending ? "Saving…" : "Save rules"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

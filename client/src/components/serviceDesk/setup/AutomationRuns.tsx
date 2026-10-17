// components/serviceDesk/setup/AutomationRuns.tsx — the run log: every
// automated thing that happened to a request (a rule applied, an automatic
// approval or its refusal, a connector delivery, self-service, AI triage) and
// how it went (story 2, AC 2.9).
import { useState } from "react"
import { Link } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RunStatusBadge } from "@/components/serviceDesk/AutomationBits"
import { describeRun } from "@/lib/serviceDesk"
import { When } from "@/components/serviceDesk/RequestBits"
import { useAutomationRuns } from "@/hooks/useServiceDesk"
import type { RunKind, RunStatus } from "@/types/serviceDesk.types"

const KIND_LABEL: Record<RunKind, string> = {
  rule: "Rule",
  auto_approve: "Automatic approval",
  webhook: "Connector",
  deflect: "Self-service",
  ai_triage: "AI triage",
}

export function AutomationRuns() {
  const [kind, setKind] = useState<RunKind | "all">("all")
  const [status, setStatus] = useState<RunStatus | "all">("all")
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAutomationRuns({ kind: kind === "all" ? undefined : kind, status: status === "all" ? undefined : status, page })
  const rows = data?.data ?? []
  const meta = data?.meta

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={kind} onValueChange={(v) => { setKind(v as RunKind | "all"); setPage(1) }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            {(Object.keys(KIND_LABEL) as RunKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v as RunStatus | "all"); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any outcome</SelectItem>
            <SelectItem value="succeeded">Succeeded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Stepped aside</SelectItem>
            <SelectItem value="pending">Waiting for result</SelectItem>
            <SelectItem value="retrying">Retrying</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Nothing has run yet.</TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground"><When at={r.startedAt} /></TableCell>
                    <TableCell>
                      <Link to={`/requests/${r.requestId}`} className="hover:underline">
                        <span className="font-mono text-xs text-muted-foreground">SR-{String(r.requestNumber).padStart(6, "0")}</span> {r.requestTitle}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{describeRun(r)}</TableCell>
                    <TableCell><RunStatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {meta && (meta.hasPrev || meta.hasNext) && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={!meta.hasPrev} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={!meta.hasNext} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}

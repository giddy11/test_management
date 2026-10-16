// components/ai/AiUsageCard.tsx — how the organisation uses AI (ai.managekeys):
// requests and failures, response times, which features are used, why
// requests fail, and how many people use it. Built from the usage log, which
// holds counts only — no prompts or replies.
import { useState } from "react"
import { Activity } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spinner } from "@/components/shared/Spinner"
import { ApiError } from "@/transport/http"
import { useAiUsage } from "@/hooks/useAi"
import { featureLabel, type AiUsagePeriod } from "@/types/ai.types"

const ERROR_LABELS: Record<string, string> = {
  auth: "API key rejected",
  account: "Provider account or plan",
  rate_limit: "Provider busy (rate limited)",
  invalid_request: "Model couldn't run the request",
  refused: "AI declined the content",
  truncated: "Answer cut off",
  unavailable: "Provider didn't respond",
  invalid_output: "Unusable answer",
  unknown: "Other",
}

const seconds = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`)
const count = (n: number) => n.toLocaleString()

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function AiUsageCard() {
  const [days, setDays] = useState<AiUsagePeriod>(30)
  const { data, isLoading, error } = useAiUsage(days)

  return (
    <Card data-cy="ai-usage">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" />
              AI usage
            </CardTitle>
            <CardDescription>
              Requests, response times and failures across the organisation. Only counts are recorded — never what
              was written.
            </CardDescription>
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as AiUsagePeriod)}>
            <SelectTrigger className="w-36" aria-label="Period"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <Spinner />
        ) : error || !data ? (
          <p className="text-sm text-destructive">{error instanceof ApiError ? error.message : "Couldn't load AI usage"}</p>
        ) : data.totals.requests === 0 ? (
          <p className="text-sm text-muted-foreground">No AI requests in this period.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Requests" value={count(data.totals.requests)} hint={`${count(data.totals.failed)} failed`} />
              <Stat label="Failure rate" value={`${data.totals.failureRate}%`} />
              <Stat
                label="People using AI"
                value={count(data.totals.people)}
                hint={data.totals.teamSize ? `${data.totals.adoptionRate}% of ${count(data.totals.teamSize)} on the team` : undefined}
              />
              <Stat label="On personal keys" value={count(data.totals.ownKeyRequests)} hint="Not billed to the organisation" />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">By feature</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Avg time</TableHead>
                    <TableHead className="text-right">Slowest 5%</TableHead>
                    <TableHead className="text-right">People</TableHead>
                    <TableHead className="text-right">Tokens in / out</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byFeature.map((f) => (
                    <TableRow key={f.feature}>
                      <TableCell className="text-sm">{featureLabel(f.feature)}</TableCell>
                      <TableCell className="text-right text-sm">{count(f.requests)}</TableCell>
                      <TableCell className="text-right text-sm">{count(f.failed)}</TableCell>
                      <TableCell className="text-right text-sm">{seconds(f.avgMs)}</TableCell>
                      <TableCell className="text-right text-sm">{seconds(f.p95Ms)}</TableCell>
                      <TableCell className="text-right text-sm">{count(f.people)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {count(f.inputTokens)} / {count(f.outputTokens)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.errors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Why requests failed</p>
                <ul className="space-y-1 text-sm">
                  {data.errors.map((e) => (
                    <li key={e.errorKind} className="flex justify-between gap-4 border-b py-1 last:border-0">
                      <span>{ERROR_LABELS[e.errorKind] ?? e.errorKind}</span>
                      <span className="text-muted-foreground">{count(e.count)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

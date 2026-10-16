// components/ai/AiCreditsCard.tsx — the signed-in user's AI credits: balance,
// what each feature costs, and their history. Credits are only spent on the
// organisation's key; a personal key is never charged.
import { useState } from "react"
import { toast } from "sonner"
import { Coins } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Spinner } from "@/components/shared/Spinner"
import { ApiError } from "@/transport/http"
import { useClearAiCreditHistory, useMyAiCredits } from "@/hooks/useAi"
import { AI_FEATURES, credits, featureLabel, type AiCreditHistoryEntry } from "@/types/ai.types"

const TYPE_LABELS: Record<AiCreditHistoryEntry["type"], string> = {
  grant: "Added",
  adjustment: "Correction",
  usage: "Used",
  refund: "Refunded",
  purchase: "Bought",
}

export function AiCreditsCard() {
  const [page, setPage] = useState(1)
  const { data, isLoading, error } = useMyAiCredits(page)
  const clear = useClearAiCreditHistory()
  const [confirm, setConfirm] = useState<{ count: number } | null>(null)

  const summary = data?.summary
  const meta = data?.meta

  const askToClear = () =>
    clear.mutate(true, {
      onSuccess: (r) => setConfirm(r),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't check your history"),
    })

  const doClear = () =>
    clear.mutate(false, {
      onSuccess: () => {
        toast.success("History cleared")
        setConfirm(null)
        setPage(1)
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't clear your history"),
    })

  return (
    <Card data-cy="ai-credits">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="size-4" />
          My AI credits
        </CardTitle>
        <CardDescription>
          Credits are used only when AI runs on the organisation's key. Your own key is never charged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Spinner />
        ) : error || !summary ? (
          <p className="text-sm text-destructive">{error instanceof ApiError ? error.message : "Couldn't load your credits"}</p>
        ) : !summary.metered && summary.history.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-cy="ai-credits-free">
            Your organisation hasn't set any prices, so AI on its key is free.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-2xl font-semibold" data-cy="ai-credit-balance">{credits(summary.balance)}</p>
              </div>
              <ul className="text-sm text-muted-foreground">
                {AI_FEATURES.map((f) => (
                  <li key={f.id}>
                    {f.label}: {summary.prices[f.id] ? credits(summary.prices[f.id]) : "free"}
                  </li>
                ))}
              </ul>
            </div>

            {summary.history.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>What</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(h.createdAt).toLocaleString()}</TableCell>
                        <TableCell className="text-sm">
                          {TYPE_LABELS[h.type]}
                          {h.feature ? ` · ${featureLabel(h.feature)}` : ""}
                          {h.projectName ? ` · ${h.projectName}` : ""}
                          {h.usedByName ? ` · by ${h.usedByName}` : ""}
                          {h.note ? <span className="block text-xs text-muted-foreground">{h.note}</span> : null}
                        </TableCell>
                        <TableCell className={`text-right text-sm ${h.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                          {h.amount > 0 ? `+${h.amount}` : h.amount}
                        </TableCell>
                        <TableCell className="text-right text-sm">{h.balanceAfter}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={askToClear} disabled={clear.isPending} data-cy="ai-credits-clear">
                    Clear history
                  </Button>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Button variant="outline" size="sm" disabled={!meta?.hasPrev} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    Page {meta?.page ?? page} of {Math.max(meta?.totalPages ?? 1, 1)}
                    <Button variant="outline" size="sm" disabled={!meta?.hasNext} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No credit activity yet.</p>
            )}
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Clear your credit history?"
        description={`${confirm?.count ?? 0} ${confirm?.count === 1 ? "entry" : "entries"} will be hidden from this list. Your balance doesn't change, and your organisation keeps its own record.`}
        confirmLabel="Clear history"
        loading={clear.isPending}
        onConfirm={doClear}
      />
    </Card>
  )
}

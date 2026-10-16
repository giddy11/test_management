// components/ai/AiCreditsAdminCard.tsx — ai.managecredits: what each AI
// feature costs on the organisation's key, and everyone's balance with a way
// to give (or take back) credits.
import { useState } from "react"
import { toast } from "sonner"
import { Coins, Search } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/shared/Spinner"
import { ApiError } from "@/transport/http"
import { useDebounce } from "@/hooks/useDebounce"
import { useAiCreditAccounts, useAiCreditPrices, useGrantAiCredits, useUpdateAiCreditPrices } from "@/hooks/useAi"
import { AI_FEATURES, credits, type AiCreditAccount, type AiFeature } from "@/types/ai.types"
import { fieldErrors } from "./aiErrors"

const PAGE_SIZE = 10

export function AiCreditsAdminCard() {
  return (
    <Card data-cy="ai-credits-admin">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="size-4" />
          AI credits for the organisation
        </CardTitle>
        <CardDescription>
          Set what each feature costs when it runs on the organisation's key, and give people credits. With
          no prices set, AI on the organisation's key is free. Personal keys are never charged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AiPricesTable />
        <AccountsTable />
      </CardContent>
    </Card>
  )
}

// ── Prices ────────────────────────────────────────────────────────────────────

function AiPricesTable() {
  const { data, isLoading } = useAiCreditPrices()
  const update = useUpdateAiCreditPrices()
  // Edits in progress; absent = unchanged from the server.
  const [draft, setDraft] = useState<Partial<Record<AiFeature, string>>>({})

  if (isLoading || !data) return <Spinner />

  const valueOf = (f: AiFeature) => draft[f] ?? String(data[f] ?? 0)
  const invalid = AI_FEATURES.some((f) => !/^\d{1,4}$/.test(valueOf(f.id)) || Number(valueOf(f.id)) > 1000)
  const dirty = AI_FEATURES.some((f) => draft[f.id] !== undefined && Number(draft[f.id]) !== data[f.id])

  const onSave = () => {
    const prices = Object.fromEntries(AI_FEATURES.map((f) => [f.id, Number(valueOf(f.id))])) as Record<AiFeature, number>
    update.mutate(prices, {
      onSuccess: () => {
        setDraft({})
        toast.success("Prices saved")
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the prices"),
    })
  }

  return (
    <div className="space-y-3" data-cy="ai-prices">
      <p className="text-sm font-medium">Price per request</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {AI_FEATURES.map((f) => (
          <div key={f.id} className="grid gap-1.5">
            <Label htmlFor={`ai-price-${f.id}`}>{f.label}</Label>
            <Input
              id={`ai-price-${f.id}`}
              inputMode="numeric"
              className="w-32"
              value={valueOf(f.id)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.id]: e.target.value.trim() }))}
              data-cy={`ai-price-${f.id}`}
            />
            <p className="text-xs text-muted-foreground">0 = free. Whole credits, up to 1000.</p>
          </div>
        ))}
      </div>
      {invalid && <p className="text-xs text-destructive">Prices must be whole numbers from 0 to 1000.</p>}
      <Button onClick={onSave} disabled={!dirty || invalid || update.isPending} data-cy="ai-prices-save">
        {update.isPending ? "Saving…" : "Save prices"}
      </Button>
    </div>
  )
}

// ── Balances ──────────────────────────────────────────────────────────────────

function AccountsTable() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const debounced = useDebounce(search.trim(), 300)
  const { data, isLoading, error } = useAiCreditAccounts({ search: debounced || undefined, page, limit: PAGE_SIZE })
  const [granting, setGranting] = useState<AiCreditAccount | null>(null)

  const rows = data?.data ?? []
  const meta = data?.meta

  return (
    <div className="space-y-3" data-cy="ai-credit-accounts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Balances</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="w-64 pl-8"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            aria-label="Search people"
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-destructive">{error instanceof ApiError ? error.message : "Couldn't load balances"}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one matches.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.userId}>
                <TableCell>
                  <p className="text-sm">{a.name || a.email}</p>
                  {a.name && <p className="text-xs text-muted-foreground">{a.email}</p>}
                </TableCell>
                <TableCell className="text-right text-sm">{credits(a.balance)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setGranting(a)} data-cy="ai-grant-open">
                    Change
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Button variant="outline" size="sm" disabled={!meta.hasPrev} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          Page {meta.page} of {meta.totalPages}
          <Button variant="outline" size="sm" disabled={!meta.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {granting && <GrantDialog account={granting} onClose={() => setGranting(null)} />}
    </div>
  )
}

function GrantDialog({ account, onClose }: { account: AiCreditAccount; onClose: () => void }) {
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const grant = useGrantAiCredits()
  const errors = fieldErrors(grant.error)

  const n = Number(amount)
  const valid = /^-?\d+$/.test(amount.trim()) && n !== 0 && Math.abs(n) <= 1_000_000

  const onSubmit = () =>
    grant.mutate(
      { userId: account.userId, amount: n, note: note.trim() || null },
      {
        onSuccess: (r) => {
          toast.success(`${account.name || account.email} now has ${credits(r.balance)}`)
          onClose()
        },
      }
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change {account.name || account.email}'s credits</DialogTitle>
          <DialogDescription>
            Current balance: {credits(account.balance)}. Enter a positive number to add credits, or a negative
            one to take some back (never below zero).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ai-grant-amount">Credits</Label>
            <Input
              id="ai-grant-amount"
              inputMode="numeric"
              value={amount}
              placeholder="e.g. 50 or -10"
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={Boolean(errors.fields.amount)}
              data-cy="ai-grant-amount"
            />
            {errors.fields.amount && <p className="text-xs text-destructive">{errors.fields.amount}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ai-grant-note">Note (optional)</Label>
            <Input id="ai-grant-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </div>
          {errors.general && <p className="text-sm text-destructive">{errors.general}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!valid || grant.isPending} data-cy="ai-grant-submit">
            {grant.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

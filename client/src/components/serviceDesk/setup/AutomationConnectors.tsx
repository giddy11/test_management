// components/serviceDesk/setup/AutomationConnectors.tsx — webhook connectors
// (Power Automate, Logic Apps, n8n…) that fulfil requests in other systems.
// The signing secret is shown once, when created or replaced. TestMate never
// holds credentials for the target systems — those stay in the connector.
import { useState } from "react"
import { Copy, KeyRound, Plug, Plus, Trash2, Zap } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { When } from "@/components/serviceDesk/RequestBits"
import {
  useCreateEndpoint,
  useDeleteEndpoint,
  useRotateEndpointSecret,
  useTestEndpoint,
  useUpdateEndpoint,
  useWebhookEndpoints,
} from "@/hooks/useServiceDesk"
import { ApiError } from "@/transport/http"
import type { WebhookEndpoint } from "@/types/serviceDesk.types"

const fail = (e: unknown) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : "Something went wrong")

const PROTOCOL = `POST <your connector URL>
X-TestMate-Event:     service_request.fulfil
X-TestMate-Delivery:  <run id — the same on a retry>
X-TestMate-Timestamp: <unix seconds>
X-TestMate-Signature: sha256=HMAC_SHA256(secret, "<timestamp>.<raw body>")

{ "event": "service_request.fulfil", "deliveryId": "…",
  "request": { "reference": "SR-000123", "item": "…", "answers": {…},
               "requester": {…}, "requestedFor": {…}, … },
  "callbackUrl": "https://…/callbacks/…" }

Answer now:   200 { "status": "succeeded" | "failed", "note": "…" }
Or later:     answer 202, then POST that same JSON to callbackUrl.
Retried after 1, 5 and 15 minutes on network errors, 408, 429 and 5xx.`

export function AutomationConnectors() {
  const { data: endpoints = [], isLoading } = useWebhookEndpoints()
  const update = useUpdateEndpoint()
  const rotate = useRotateEndpointSecret()
  const test = useTestEndpoint()
  const remove = useDeleteEndpoint()
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null)
  const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null)
  const [rotating, setRotating] = useState<WebhookEndpoint | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A connector receives approved requests for the items that use it, does the work in the target system, and reports back.
          Point a catalog item at a connector in its editor (How it's fulfilled).
        </p>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 size-3.5" /> New connector</Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && endpoints.length === 0 && (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">No connectors yet.</CardContent></Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {endpoints.map((e) => (
          <Card key={e.id} className={e.isActive ? "" : "opacity-70"}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base"><Plug className="size-4" /> {e.name} {!e.isActive && <Badge variant="outline">Off</Badge>}</CardTitle>
                <CardDescription className="truncate font-mono text-xs" title={e.urlDisplay}>{e.urlDisplay}</CardDescription>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={`Delete ${e.name}`} onClick={() => setDeleting(e)}><Trash2 className="size-3.5" /></Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Used by {e.itemCount} item{e.itemCount === 1 ? "" : "s"} ·{" "}
                {e.lastSuccessAt ? <>last worked <When at={e.lastSuccessAt} /></> : "never worked yet"}
                {e.lastFailureAt && (!e.lastSuccessAt || e.lastFailureAt > e.lastSuccessAt) && (
                  <span className="block text-red-600 dark:text-red-400">Last failed <When at={e.lastFailureAt} />: {e.lastFailure}</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={test.isPending}
                  onClick={() =>
                    test.mutate(e.id, {
                      onSuccess: (r) => (r.ok ? toast.success(`It answered ${r.status} in ${r.ms} ms`) : toast.error(`It didn't work: ${r.error ?? `HTTP ${r.status}`}`)),
                      onError: fail,
                    })
                  }
                >
                  <Zap className="mr-1 size-3.5" /> Send a test
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRotating(e)}><KeyRound className="mr-1 size-3.5" /> Replace secret</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update.mutate({ id: e.id, isActive: !e.isActive }, { onSuccess: () => toast.success(e.isActive ? "Connector switched off" : "Connector switched on"), onError: fail })}
                >
                  {e.isActive ? "Switch off" : "Switch on"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">What a connector receives</CardTitle>
          <CardDescription>
            Check the signature with the secret before trusting a request. Step-by-step setup for Power Automate, Zapier, n8n
            and Make is in the{" "}
            <a href="/docs#it-requests-connectors" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              connectors manual
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent><pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{PROTOCOL}</pre></CardContent>
      </Card>

      <CreateConnectorDialog open={creating} onClose={() => setCreating(false)} onCreated={(name, value) => setSecret({ name, value })} />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(o) => !o && setRotating(null)}
        title={`Replace the secret of "${rotating?.name}"?`}
        description="The old secret stops working at once. Update the connector with the new one straight away, or its signature checks will fail."
        confirmLabel="Replace"
        loading={rotate.isPending}
        onConfirm={() =>
          rotating &&
          rotate.mutate(rotating.id, {
            onSuccess: (r) => { setSecret({ name: rotating.name, value: r.secret }); setRotating(null) },
            onError: fail,
          })
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="A connector used by catalog items can't be deleted — switch them to another way of fulfilling first."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { toast.success("Connector deleted"); setDeleting(null) }, onError: fail })}
      />
    </div>
  )
}

function CreateConnectorDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string, secret: string) => void }) {
  const create = useCreateEndpoint()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setName(""); setUrl("") } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New connector</DialogTitle>
          <DialogDescription>Paste the HTTPS address your automation tool gave you (for example a Power Automate "When an HTTP request is received" URL).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="con-name">Name</Label>
            <Input id="con-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Microsoft 365 licences" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="con-url">Address</Label>
            <Input id="con-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <p className="text-xs text-muted-foreground">Stored encrypted — it often contains its own key.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={create.isPending || !name.trim() || !url.trim()}
            onClick={() =>
              create.mutate(
                { name: name.trim(), url: url.trim() },
                { onSuccess: (r) => { onCreated(r.endpoint.name, r.secret); onClose(); setName(""); setUrl("") }, onError: fail }
              )
            }
          >
            Add connector
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SecretDialog({ secret, onClose }: { secret: { name: string; value: string } | null; onClose: () => void }) {
  return (
    <Dialog open={secret !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Signing secret for "{secret?.name}"</DialogTitle>
          <DialogDescription>Copy it into your connector now. It won't be shown again — if it's lost, replace it.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly className="font-mono text-xs" value={secret?.value ?? ""} onFocus={(e) => e.target.select()} />
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(secret?.value ?? "")
              toast.success("Copied")
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <DialogFooter><Button onClick={onClose}>I've saved it</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

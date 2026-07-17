// Manage a client company's partner integration API key (server-to-server
// ticket creation/lookup, e.g. for a product like DOMS). Tickets created
// with it land in THIS company's IT queue — same destination as their public
// ticket form. Distinct from the ticket form link — this is a real bearer
// secret, so the raw value is only ever shown once, right after generate/rotate.
import { useState } from "react"
import { Copy, KeyRound, RefreshCw, ShieldOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useSetIntegrationApiKey } from "@/hooks/useClientCompanies"
import { ApiError } from "@/transport/http"
import type { ClientCompany } from "@/types/clientCompany.types"

interface Props {
  company: ClientCompany | null
  onOpenChange: (open: boolean) => void
}

export function IntegrationApiKeyDialog({ company, onOpenChange }: Props) {
  const setKey = useSetIntegrationApiKey()
  const [revoking, setRevoking] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  const companyId = company?.id ?? ""
  const hasKey = Boolean(company?.integrationApiKeyLastFour)

  const generateOrRotate = () => {
    if (!company) return
    setKey.mutate(
      { id: company.id, enabled: true },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: ({ apiKey }) => {
          if (apiKey) setRevealedKey(apiKey)
        },
      }
    )
  }

  const revoke = () => {
    setKey.mutate(
      { id: companyId, enabled: false },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: () => {
          toast.success("Integration API key revoked")
          setRevoking(false)
        },
      }
    )
  }

  const copyKey = () => {
    if (!revealedKey) return
    navigator.clipboard.writeText(revealedKey)
    toast.success("Key copied")
  }

  return (
    <>
      <Dialog open={Boolean(company)} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" /> Integration API key
            </DialogTitle>
            <DialogDescription>
              Lets {company?.name}'s own backend create tickets and check their status
              programmatically (server-to-server), separate from the public ticket form. Tickets
              created with it land in {company?.name}'s ticket queue. See the docs for the
              request/response shapes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            {hasKey ? (
              <>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  Key ending in •••{company?.integrationApiKeyLastFour}
                  {company?.integrationApiKeyCreatedAt && (
                    <> · generated {new Date(company.integrationApiKeyCreatedAt).toLocaleDateString()}</>
                  )}
                </code>
                <Button size="sm" variant="outline" onClick={generateOrRotate} disabled={setKey.isPending}>
                  <RefreshCw className="mr-1 size-3.5" /> Rotate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setRevoking(true)}
                  disabled={setKey.isPending}
                >
                  <ShieldOff className="mr-1 size-3.5" /> Revoke
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={generateOrRotate} disabled={setKey.isPending}>
                <KeyRound className="mr-1 size-3.5" /> Generate key
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revealedKey)} onOpenChange={(o) => !o && setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your integration API key</DialogTitle>
            <DialogDescription>
              Copy it now — for security, it won't be shown again. If you lose it, rotate to
              generate a new one. Tickets created with it land in {company?.name}'s ticket queue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{revealedKey}</code>
            <Button size="sm" variant="outline" onClick={copyKey}>
              <Copy className="mr-1 size-3.5" /> Copy
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealedKey(null)}>Done — I've copied it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revoking}
        onOpenChange={setRevoking}
        title="Revoke integration API key"
        description={`Any partner integration using this key for ${company?.name} will immediately stop working until a new key is generated and updated on their end.`}
        confirmLabel="Revoke"
        loading={setKey.isPending}
        onConfirm={revoke}
      />
    </>
  )
}

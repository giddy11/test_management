// Admin card on the project Feedback tab: the client companies using this
// product. Each gets its own public form link (feedback lands in THEIR IT
// queue, not yours) and its own supporter accounts.
import { useState } from "react"
import { Building2, Copy, Link2, Link2Off, Pencil, Plus, Trash2, Users } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { ClientCompanyFormDialog } from "@/components/feedback/ClientCompanyFormDialog"
import { SupportersDialog } from "@/components/feedback/SupportersDialog"
import { IntegrationApiKeyCard } from "@/components/feedback/IntegrationApiKeyCard"
import {
  useClientCompanies,
  useDeleteClientCompany,
  useSetClientCompanyLink,
} from "@/hooks/useClientCompanies"
import { ApiError } from "@/transport/http"
import type { ClientCompany } from "@/types/clientCompany.types"

export function ClientCompaniesCard({ projectId }: { projectId: string }) {
  const { data: companies = [], isLoading } = useClientCompanies(projectId)
  const setLink = useSetClientCompanyLink()
  const deleteCompany = useDeleteClientCompany()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ClientCompany | null>(null)
  const [managingSupporters, setManagingSupporters] = useState<ClientCompany | null>(null)
  const [deleting, setDeleting] = useState<ClientCompany | null>(null)

  const toggleLink = (company: ClientCompany, enabled: boolean) => {
    setLink.mutate(
      { id: company.id, enabled },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: ({ feedbackToken }) =>
          toast.success(
            feedbackToken
              ? `Ticket form for ${company.name} enabled`
              : `Ticket form for ${company.name} disabled`
          ),
      }
    )
  }

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/feedback/${token}`)
    toast.success("Link copied — share it with this company's users")
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4 text-primary" /> Client companies
        </CardTitle>
        <CardDescription>
          Companies using this product with their own IT support. Their users' tickets — from
          the public ticket form or their partner integration API key — go to that company's
          ticket queue first; you only see what their IT team escalates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading client companies…</p>}
        {!isLoading && companies.length === 0 && (
          <p className="text-sm text-muted-foreground">No client companies yet.</p>
        )}

        {companies.map((c) => (
          <div key={c.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{c.name}</span>
              <Badge variant="secondary" className="text-xs">
                <Users className="mr-1 size-3" />
                {c.supporterCount} supporter{c.supporterCount === 1 ? "" : "s"}
              </Badge>
              {c.contactEmail && (
                <span className="text-xs text-muted-foreground">{c.contactEmail}</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" className="size-7 p-0" onClick={() => { setEditing(c); setFormOpen(true) }}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleting(c)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {c.feedbackToken ? (
                <>
                  <code className="max-w-56 truncate rounded bg-muted px-2 py-1 text-xs">
                    {`${window.location.origin}/feedback/${c.feedbackToken}`}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copyLink(c.feedbackToken!)}>
                    <Copy className="mr-1 size-3.5" /> Copy link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleLink(c, false)} disabled={setLink.isPending}>
                    <Link2Off className="mr-1 size-3.5" /> Disable
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => toggleLink(c, true)} disabled={setLink.isPending}>
                  <Link2 className="mr-1 size-3.5" /> Enable ticket form
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setManagingSupporters(c)}>
                <Users className="mr-1 size-3.5" /> Supporters
              </Button>
            </div>
            <div className="mt-2 border-t pt-2">
              <IntegrationApiKeyCard company={c} />
            </div>
          </div>
        ))}

        <Button size="sm" variant="outline" onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus className="mr-1 size-3.5" /> Add client company
        </Button>
      </CardContent>

      <ClientCompanyFormDialog
        projectId={projectId}
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null) }}
        editing={editing}
      />

      <SupportersDialog
        company={managingSupporters}
        onOpenChange={(o) => !o && setManagingSupporters(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete client company"
        description={`"${deleting?.name}" will be removed. Remove its supporter accounts first — deletion is blocked while any exist.`}
        confirmLabel="Delete"
        loading={deleteCompany.isPending}
        onConfirm={() =>
          deleting &&
          deleteCompany.mutate(deleting.id, {
            onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
            onSuccess: () => {
              toast.success("Client company deleted")
              setDeleting(null)
            },
          })
        }
      />
    </Card>
  )
}

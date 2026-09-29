import { useMemo, useState } from "react"
import { Link2, Repeat, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { TicketLinkItem } from "@/components/tickets/TicketLinkItem"
import { LinkTicketDialog } from "@/components/tickets/LinkTicketDialog"
import {
  useCreateTicketLink,
  useDeleteTicketLink,
  useSimilarTickets,
  useTicketLinks,
} from "@/hooks/useTicketLinks"
import { ticketKey } from "@/lib/ticketLinks"
import { ApiError } from "@/transport/http"
import type { SimilarTicket, TicketType } from "@/types/ticketLink.types"

interface Props {
  type: TicketType
  ticketId: string
  projectId: string
  // The ticket's own title — used to suggest earlier tickets that read like it.
  title: string
  // Whether to offer linking at all. The API is the real gate (a read-only
  // viewer is refused); this only spares them a button that would fail.
  canLink?: boolean
  // Called when a linked ticket is followed (a dialog closes itself here).
  onNavigate?: () => void
}

// "Has this been raised before?" for one ticket: how many times the problem has
// come up (with each report listed), the tickets related to it, and — for anyone
// who can link — earlier tickets whose titles read like this one.
export function RelatedTickets({ type, ticketId, projectId, title, canLink = true, onNavigate }: Props) {
  const { data: links, isLoading } = useTicketLinks(type, ticketId)
  const del = useDeleteTicketLink()
  const create = useCreateTicketLink()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [unlinking, setUnlinking] = useState<{ linkId: string; label: string } | null>(null)

  const source = useMemo(() => ({ type, id: ticketId }), [type, ticketId])

  const occurrences = links?.occurrences ?? []
  const related = links?.related ?? []
  const duplicateOf = links?.duplicateOf ?? null
  const occurrenceCount = links?.occurrenceCount ?? 1
  // A ticket is a repeat of at most one original, and an original with repeats
  // can't itself become one — so only a ticket that is neither may be offered
  // "this is a repeat of…".
  const canBeRepeat = !duplicateOf && occurrences.length === 0

  // Everything already on this page, so it isn't offered (or linked) twice.
  const linkedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const o of links?.occurrences ?? []) keys.add(ticketKey(o.ticket))
    for (const r of links?.related ?? []) keys.add(ticketKey(r.ticket))
    if (links?.duplicateOf) keys.add(ticketKey(links.duplicateOf.ticket))
    return keys
  }, [links])

  // Earlier tickets that read like this one and aren't linked yet. Only fetched
  // for someone who can act on them.
  const { data: similar = [] } = useSimilarTickets(projectId, title, source, canLink && Boolean(links))
  const suggestions = similar.filter((s) => !linkedKeys.has(ticketKey(s))).slice(0, 3)

  const linkSuggestion = (s: SimilarTicket, linkType: "duplicate" | "related") =>
    create.mutate(
      {
        sourceType: type,
        sourceId: ticketId,
        targetType: s.type,
        targetId: s.id,
        linkType,
      },
      {
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
        onSuccess: ({ link, redirectedFrom }) =>
          toast.success(
            redirectedFrom
              ? `${redirectedFrom.referenceCode} is itself a repeat of ${link.ticket.referenceCode}, so it was linked there`
              : "Tickets linked"
          ),
      }
    )

  const confirmUnlink = () => {
    if (!unlinking) return
    del.mutate(unlinking.linkId, {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
      onSuccess: () => {
        toast.success("Link removed")
        setUnlinking(null)
      },
    })
  }

  const unlinkButton = (linkId: string, label: string) =>
    canLink && (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="ml-auto size-6 text-muted-foreground hover:text-destructive"
        aria-label={`Remove link to ${label}`}
        onClick={() => setUnlinking({ linkId, label })}
        data-cy="unlink-ticket"
      >
        <X className="size-3.5" />
      </Button>
    )

  const empty = !isLoading && occurrences.length === 0 && related.length === 0

  return (
    <section className="space-y-3" data-cy="related-tickets">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Related tickets</h3>
        {canLink && (
          <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)} data-cy="link-ticket">
            <Link2 className="mr-1 size-3.5" /> Link ticket
          </Button>
        )}
      </div>

      {occurrences.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3" data-cy="occurrences">
          <div className="flex flex-wrap items-center gap-2">
            <Repeat className="size-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium" data-cy="occurrence-count">
              Reported {occurrenceCount} times
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {duplicateOf
              ? `This ticket is a repeat of ${duplicateOf.ticket.referenceCode}. Every report of the problem, oldest first:`
              : "Every report of this problem, oldest first:"}
          </p>
          <ul className="space-y-1.5">
            {occurrences.map((o) => (
              <li key={ticketKey(o.ticket)} className="flex items-center gap-2" data-cy="occurrence">
                <div className="min-w-0 flex-1">
                  <TicketLinkItem ticket={o.ticket} onNavigate={onNavigate}>
                    {o.isOriginal && <Badge variant="outline" className="text-[10px]">Original</Badge>}
                    {o.isCurrent && <Badge className="text-[10px]">This ticket</Badge>}
                  </TicketLinkItem>
                </div>
                {o.linkId && unlinkButton(o.linkId, o.ticket.referenceCode)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {related.length > 0 && (
        <ul className="space-y-1.5" data-cy="related-list">
          {related.map((r) => (
            <li key={r.linkId} className="flex items-center gap-2" data-cy="related-ticket">
              <div className="min-w-0 flex-1">
                <TicketLinkItem ticket={r.ticket} onNavigate={onNavigate}>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Related</Badge>
                </TicketLinkItem>
              </div>
              {unlinkButton(r.linkId, r.ticket.referenceCode)}
            </li>
          ))}
        </ul>
      )}

      {empty && (
        <p className="text-sm text-muted-foreground" data-cy="no-links">
          Nothing linked yet. Link a ticket that reports the same problem, or one that touches the
          same thing.
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-dashed p-3" data-cy="possible-repeats">
          <p className="text-xs font-medium text-muted-foreground">Possible repeats — similar titles</p>
          <ul className="space-y-1.5">
            {suggestions.map((s) => (
              <li key={ticketKey(s)} className="flex flex-wrap items-center gap-2" data-cy="suggestion">
                <div className="min-w-0 flex-1">
                  <TicketLinkItem ticket={s} onNavigate={onNavigate}>
                    {s.occurrenceCount > 1 && (
                      <Badge variant="outline" className="text-[10px]">Reported {s.occurrenceCount}×</Badge>
                    )}
                  </TicketLinkItem>
                </div>
                {canLink && (
                  <div className="flex shrink-0 gap-1">
                    {canBeRepeat && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={create.isPending}
                        onClick={() => linkSuggestion(s, "duplicate")}
                        data-cy="suggestion-repeat"
                      >
                        Same problem
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={create.isPending}
                      onClick={() => linkSuggestion(s, "related")}
                      data-cy="suggestion-related"
                    >
                      Related
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <LinkTicketDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        projectId={projectId}
        source={source}
        linkedKeys={linkedKeys}
      />

      <ConfirmDialog
        open={Boolean(unlinking)}
        onOpenChange={(o) => !o && setUnlinking(null)}
        title="Remove link"
        description={`${unlinking?.label} will no longer be linked to this ticket. Neither ticket is deleted.`}
        confirmLabel="Remove link"
        loading={del.isPending}
        onConfirm={confirmUnlink}
      />
    </section>
  )
}

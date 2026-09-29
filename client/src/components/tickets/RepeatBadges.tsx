import { Link2, Repeat } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useTicketLinks } from "@/hooks/useTicketLinks"
import type { TicketLinkSummary, TicketType } from "@/types/ticketLink.types"

// The same count for a ticket's own page, beside its title: "Reported 3 times"
// whenever the problem has been raised more than once. Shares its query with the
// Related tickets section, so it costs no extra request.
export function OccurrenceBadge({ type, id }: { type: TicketType; id: string }) {
  const { data } = useTicketLinks(type, id)
  if (!data || data.occurrenceCount < 2) return null
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400"
      title={
        data.duplicateOf
          ? `A repeat of ${data.duplicateOf.ticket.referenceCode}`
          : `${data.occurrenceCount - 1} repeat${data.occurrenceCount === 2 ? "" : "s"} recorded`
      }
      data-cy="header-occurrences"
    >
      <Repeat className="size-3" /> Reported {data.occurrenceCount} times
    </Badge>
  )
}

// The badges a list row wears when it has been raised before: "Reported 3×" on
// the original, "Repeat" on each later report, and a count of related tickets.
// Renders nothing for a ticket with no links, so rows without any stay unchanged.
export function RepeatBadges({ summary }: { summary?: TicketLinkSummary }) {
  if (!summary) return null
  const { duplicateCount, isDuplicate, relatedCount } = summary
  if (!duplicateCount && !isDuplicate && !relatedCount) return null

  return (
    <>
      {duplicateCount > 0 && (
        <Badge
          variant="outline"
          className="gap-1 border-amber-500/50 text-[10px] text-amber-600 dark:text-amber-400"
          title={`Raised ${duplicateCount + 1} times — ${duplicateCount} repeat${duplicateCount === 1 ? "" : "s"} recorded`}
          data-cy="repeat-count"
        >
          <Repeat className="size-3" /> Reported {duplicateCount + 1}×
        </Badge>
      )}
      {isDuplicate && (
        <Badge
          variant="outline"
          className="text-[10px] text-muted-foreground"
          title="Marked as a repeat of an earlier ticket"
          data-cy="repeat-badge"
        >
          Repeat
        </Badge>
      )}
      {relatedCount > 0 && (
        <Badge
          variant="outline"
          className="gap-1 text-[10px] text-muted-foreground"
          title={`${relatedCount} related ticket${relatedCount === 1 ? "" : "s"}`}
          data-cy="related-count"
        >
          <Link2 className="size-3" /> {relatedCount}
        </Badge>
      )}
    </>
  )
}

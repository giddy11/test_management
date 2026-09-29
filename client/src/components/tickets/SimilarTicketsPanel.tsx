import { useEffect, useState } from "react"
import { Check, Repeat } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TicketLinkItem } from "@/components/tickets/TicketLinkItem"
import { useSimilarTickets } from "@/hooks/useTicketLinks"
import { useDebounce } from "@/hooks/useDebounce"
import { SIMILAR_MIN_LENGTH, ticketKey } from "@/lib/ticketLinks"
import type { PendingTicketLink, SimilarTicket, TicketLinkType } from "@/types/ticketLink.types"

// How many suggestions show before "Show more" — enough to spot the one that
// matters without pushing the rest of the form off screen.
const COLLAPSED_COUNT = 3

const normalise = (s: string) => s.replace(/\s+/g, " ").trim()

interface Props {
  projectId: string
  // The title as it is being typed.
  title: string
  // The links chosen so far — made once the new ticket has been saved.
  pending: PendingTicketLink[]
  onChange: (next: PendingTicketLink[]) => void
  // "bug" / "request" — used in the wording only.
  noun: string
}

// Shown under the title of a new ticket: earlier tickets that read like it. This
// is the moment "has this been raised before?" is cheapest to answer — before
// the new one exists. The report is still saved either way; picking one only
// records the link, so the team can see how often a problem comes back.
export function SimilarTicketsPanel({ projectId, title, pending, onChange, noun }: Props) {
  const [expanded, setExpanded] = useState(false)

  // Two lengths, on purpose. The live title decides whether the panel exists at
  // all, so it goes the moment the field is cleared; the debounced one decides
  // whether the results belong to what is typed, so a stale list never lingers
  // while the next search is on its way.
  const typed = useDebounce(title, 500)
  const tooShort = normalise(title).length < SIMILAR_MIN_LENGTH
  const resultsCurrent = normalise(typed).length >= SIMILAR_MIN_LENGTH
  const { data } = useSimilarTickets(projectId, typed)
  const similar = resultsCurrent ? (data ?? []) : []

  // Clearing the title clears the picks with it — otherwise a link would still be
  // made for a suggestion the user can no longer see.
  useEffect(() => {
    if (tooShort && pending.length > 0) onChange([])
  }, [tooShort, pending.length, onChange])

  if (tooShort) return null

  // A ticket that was picked stays listed even if a later keystroke stops matching
  // it, so a choice is never silently lost.
  const shown: SimilarTicket[] = [
    ...similar,
    ...pending.map((p) => p.ticket).filter((t) => !similar.some((s) => ticketKey(s) === ticketKey(t))),
  ]
  if (shown.length === 0) return null

  const choiceFor = (t: SimilarTicket) => pending.find((p) => ticketKey(p.ticket) === ticketKey(t))?.linkType

  // Picking the same choice again un-picks it. A ticket can be a repeat of only
  // one original, so a new "same problem" replaces the previous one.
  const toggle = (t: SimilarTicket, linkType: TicketLinkType) => {
    if (choiceFor(t) === linkType) {
      onChange(pending.filter((p) => ticketKey(p.ticket) !== ticketKey(t)))
      return
    }
    onChange([
      ...pending.filter(
        (p) => ticketKey(p.ticket) !== ticketKey(t) && !(linkType === "duplicate" && p.linkType === "duplicate")
      ),
      { ticket: t, linkType },
    ])
  }

  // Anything picked stays in view even when the list is collapsed.
  const visible = expanded ? shown : shown.filter((t, i) => i < COLLAPSED_COUNT || choiceFor(t))
  const hidden = shown.length - visible.length
  const repeatOf = pending.find((p) => p.linkType === "duplicate")?.ticket

  return (
    <div className="min-w-0 space-y-3 rounded-lg border bg-muted/30 p-3" data-cy="similar-tickets">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Repeat className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">This may have been raised before</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            If one of these is the same problem, mark it. Your {noun} is still saved — it&apos;s just
            linked, so the team can see how often it comes back.
          </p>
        </div>
      </div>

      <ul className="divide-y overflow-hidden rounded-md border bg-background">
        {visible.map((t) => {
          const choice = choiceFor(t)
          return (
            <li key={ticketKey(t)} className="flex items-center gap-3 px-3 py-2.5" data-cy="similar-ticket">
              <div className="min-w-0 flex-1">
                <TicketLinkItem ticket={t}>
                  {t.occurrenceCount > 1 && (
                    <Badge variant="outline" className="text-[10px]">Reported {t.occurrenceCount}×</Badge>
                  )}
                </TicketLinkItem>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={choice === "duplicate" ? "default" : "outline"}
                  aria-pressed={choice === "duplicate"}
                  onClick={() => toggle(t, "duplicate")}
                  data-cy="mark-repeat"
                >
                  {choice === "duplicate" && <Check className="size-3.5" />}
                  Same problem
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={choice === "related" ? "secondary" : "ghost"}
                  aria-pressed={choice === "related"}
                  onClick={() => toggle(t, "related")}
                  data-cy="mark-related"
                >
                  {choice === "related" && <Check className="size-3.5" />}
                  Related
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {(hidden > 0 || expanded) && shown.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-medium text-primary hover:underline"
          data-cy="similar-toggle"
        >
          {expanded ? "Show fewer" : `Show ${hidden} more`}
        </button>
      )}

      {repeatOf && (
        <p className="flex items-center gap-1.5 text-xs font-medium" data-cy="repeat-summary">
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          This {noun} will be recorded as a repeat of {repeatOf.referenceCode} when you submit.
        </p>
      )}
    </div>
  )
}

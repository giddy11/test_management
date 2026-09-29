import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { TicketStatusBadge, TicketTypeIcon } from "@/components/tickets/TicketStatusBadge"
import { useCreateTicketLink, useTicketCandidates } from "@/hooks/useTicketLinks"
import { useDebounce } from "@/hooks/useDebounce"
import { CANDIDATE_MIN_LENGTH, ticketKey } from "@/lib/ticketLinks"
import { ApiError } from "@/transport/http"
import type { CreateTicketLinkPayload, SimilarTicket, TicketType } from "@/types/ticketLink.types"

// How the picked ticket relates to the one whose page this is.
type Relation = "repeat-of" | "has-repeat" | "related"

const RELATIONS: { value: Relation; label: string; hint: string }[] = [
  {
    value: "repeat-of",
    label: "This ticket is a repeat of the one I pick",
    hint: "The same problem, raised again. The picked ticket becomes the original.",
  },
  {
    value: "has-repeat",
    label: "The ticket I pick is a repeat of this one",
    hint: "This ticket is the original; the picked one is a later report of it.",
  },
  {
    value: "related",
    label: "They're related, but not the same problem",
    hint: "Connected — same area, a cause, a workaround — without counting as a repeat.",
  },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  // The ticket whose page this is.
  source: { type: TicketType; id: string }
  // Tickets already linked to it (as "type:id"), which can't be linked again.
  linkedKeys: Set<string>
}

export function LinkTicketDialog({ open, onOpenChange, projectId, source, linkedKeys }: Props) {
  const create = useCreateTicketLink()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<SimilarTicket | null>(null)
  const [relation, setRelation] = useState<Relation>("repeat-of")

  const term = useDebounce(query, 300)
  const { data: results = [], isFetching } = useTicketCandidates(projectId, term, source)

  // Start clean on every open.
  useEffect(() => {
    if (open) {
      setQuery("")
      setSelected(null)
      setRelation("repeat-of")
    }
  }, [open])

  const submit = () => {
    if (!selected) return
    const payload: CreateTicketLinkPayload =
      relation === "has-repeat"
        ? {
            sourceType: selected.type,
            sourceId: selected.id,
            targetType: source.type,
            targetId: source.id,
            linkType: "duplicate",
          }
        : {
            sourceType: source.type,
            sourceId: source.id,
            targetType: selected.type,
            targetId: selected.id,
            linkType: relation === "repeat-of" ? "duplicate" : "related",
          }

    create.mutate(payload, {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
      onSuccess: ({ link, redirectedFrom }) => {
        toast.success(
          redirectedFrom
            ? `${redirectedFrom.referenceCode} is itself a repeat of ${link.ticket.referenceCode}, so it was linked there — the count stays in one place`
            : "Tickets linked"
        )
        onOpenChange(false)
      },
    })
  }

  const searching = query.trim().length >= CANDIDATE_MIN_LENGTH

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Link a ticket</DialogTitle>
          <DialogDescription>
            Search this project's bugs, feature requests and tickets by title, or paste a reference
            code like BF-20260728-014.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or reference code…"
              className="pl-8"
              aria-label="Search tickets"
              data-cy="link-ticket-search"
            />
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1" data-cy="ticket-candidates">
            {!searching && (
              <p className="p-3 text-center text-sm text-muted-foreground">
                Type at least {CANDIDATE_MIN_LENGTH} characters to search.
              </p>
            )}
            {searching && results.length === 0 && !isFetching && (
              <p className="p-3 text-center text-sm text-muted-foreground">No matching tickets.</p>
            )}
            {searching &&
              results.map((t) => {
                const already = linkedKeys.has(ticketKey(t))
                const isSelected = selected ? ticketKey(selected) === ticketKey(t) : false
                return (
                  <button
                    key={ticketKey(t)}
                    type="button"
                    disabled={already}
                    aria-pressed={isSelected}
                    onClick={() => setSelected(t)}
                    data-cy="ticket-candidate"
                    className={`block w-full min-w-0 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${
                      isSelected ? "bg-accent ring-1 ring-primary" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <TicketTypeIcon type={t.type} className="text-muted-foreground" />
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{t.referenceCode}</span>
                      <span className="min-w-0 truncate text-sm font-medium">{t.title}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[1.375rem]">
                      <TicketStatusBadge type={t.type} status={t.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </span>
                      {t.occurrenceCount > 1 && (
                        <Badge variant="outline" className="text-[10px]">Reported {t.occurrenceCount}×</Badge>
                      )}
                      {already && <Badge variant="secondary" className="text-[10px]">Already linked</Badge>}
                    </span>
                  </button>
                )
              })}
          </div>

          {selected && (
            <fieldset className="grid gap-2" data-cy="link-relation">
              <legend className="text-sm font-medium">
                How does {selected.referenceCode} relate to this ticket?
              </legend>
              {RELATIONS.map((r) => (
                <label
                  key={r.value}
                  className="flex cursor-pointer items-start gap-2 rounded-md border p-2 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="link-relation"
                    value={r.value}
                    checked={relation === r.value}
                    onChange={() => setRelation(r.value)}
                    className="mt-1"
                    data-cy={`relation-${r.value}`}
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{r.label}</span>
                    <span className="text-xs text-muted-foreground">{r.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!selected || create.isPending}
            data-cy="link-ticket-submit"
          >
            {create.isPending ? "Linking…" : "Link ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

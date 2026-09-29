import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { TicketStatusBadge, TicketTypeIcon } from "@/components/tickets/TicketStatusBadge"
import { ticketPath } from "@/lib/ticketLinks"
import type { TicketRef } from "@/types/ticketLink.types"

interface Props {
  ticket: TicketRef
  // Called when the link is followed — a dialog closes itself here, since the
  // ticket it links to opens somewhere else.
  onNavigate?: () => void
  // Trailing badges, shown after the status and date.
  children?: ReactNode
}

// One ticket as two lines: what it is (kind, reference code, title — a link to
// it) above how it stands (status, date, any badges). The title takes the room
// it needs and truncates rather than wrapping, so a list of these stays even.
export function TicketLinkItem({ ticket, onNavigate, children }: Props) {
  return (
    <div className="min-w-0" data-cy="linked-ticket">
      <div className="flex min-w-0 items-center gap-2">
        <TicketTypeIcon type={ticket.type} className="text-muted-foreground" />
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{ticket.referenceCode}</span>
        <Link
          to={ticketPath(ticket)}
          onClick={onNavigate}
          title={ticket.title}
          className="min-w-0 truncate text-sm font-medium hover:underline"
        >
          {ticket.title}
        </Link>
      </div>
      {/* Indented to sit under the title: the icon is size-3.5 plus a gap-2. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[1.375rem]">
        <TicketStatusBadge type={ticket.type} status={ticket.status} />
        <span className="text-xs text-muted-foreground">{new Date(ticket.createdAt).toLocaleDateString()}</span>
        {children}
      </div>
    </div>
  )
}

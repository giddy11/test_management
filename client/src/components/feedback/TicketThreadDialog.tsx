// Public/unauthenticated ticket comment thread — the "My Tickets" side.
// Proves ownership with the same email + OTP code as the "My Tickets" lookup
// itself (see FeedbackEndpoints.publicAddComment) — no account, no separate
// credential. See PublicCommentThread for the shared list+composer body.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PublicCommentThread } from "@/components/feedback/PublicCommentThread"
import { FeedbackEndpoints } from "@/endpoints/feedback.endpoints"
import type { MyTicket } from "@/types/feedback.types"

interface Props {
  ticket: MyTicket | null
  email: string
  code: string
  onOpenChange: (open: boolean) => void
}

export function TicketThreadDialog({ ticket, email, code, onOpenChange }: Props) {
  return (
    <Dialog open={Boolean(ticket)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {ticket && `${ticket.ticketCode} — `}
            {ticket?.title}
          </DialogTitle>
          <DialogDescription>Your conversation with the support team.</DialogDescription>
        </DialogHeader>

        {ticket && (
          <PublicCommentThread
            key={ticket.id}
            feedbackId={ticket.id}
            onSubmit={(body, files) => FeedbackEndpoints.publicAddComment(ticket.id, email, code, body, files)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

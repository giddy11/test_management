// endpoints/feedback.endpoints.ts
import { wrapCall, uploadFilesWithFields } from "@/transport/http"
import type {
  Feedback,
  FeedbackComment,
  FeedbackSeverity,
  FeedbackStatusHistoryEntry,
  FetchFeedbackParams,
  ManageFeedbackPayload,
  MyTicket,
  PublicFeedbackForm,
  SubmitPublicFeedbackPayload,
  SupportQueueParams,
  WhatsAppTicketPayload,
  WhatsAppTicketResult,
} from "@/types/feedback.types"
import type { Supporter } from "@/types/clientCompany.types"

// Comment posting is multipart/form-data (attachments), so every field must
// be a string — mentionedUserIds is JSON-encoded rather than sent as a real
// array (parsed back server-side, see feedbackComment.controller.ts).
function commentFields(body: string, parentId?: string, mentionedUserIds?: string[]) {
  const fields: Record<string, string> = { body }
  if (parentId) fields.parentId = parentId
  if (mentionedUserIds && mentionedUserIds.length > 0) {
    fields.mentionedUserIds = JSON.stringify(mentionedUserIds)
  }
  return fields
}

export const FeedbackEndpoints = {
  fetchAll: (params: FetchFeedbackParams) =>
    wrapCall<Feedback[]>("GET", "/api/v1/feedback", params as unknown as Record<string, unknown>),

  // TestMate's own in-app WhatsApp widget, just before its wa.me hand-off.
  createTestMateSupportTicket: (payload: WhatsAppTicketPayload) =>
    wrapCall<WhatsAppTicketResult>(
      "POST",
      "/api/v1/feedback/testmate-support",
      payload as unknown as Record<string, unknown>
    ),

  manage: (id: string, payload: ManageFeedbackPayload) =>
    wrapCall<Feedback>("PATCH", `/api/v1/feedback/${id}`, payload as unknown as Record<string, unknown>),

  remove: (id: string) =>
    wrapCall<null>("DELETE", `/api/v1/feedback/${id}`),

  history: (id: string) =>
    wrapCall<FeedbackStatusHistoryEntry[]>("GET", `/api/v1/feedback/${id}/history`),

  // Ticket comment thread — write only; reads are a realtime Firestore
  // listener instead (see hooks/useFeedbackComments.ts). Same shape reused
  // for the IT-support portal and public routes below (the server resolves
  // which tier owns the ticket / verifies the submitter's credential).
  addComment: (
    id: string,
    body: string,
    files: File[] = [],
    parentId?: string,
    mentionedUserIds?: string[]
  ) =>
    uploadFilesWithFields<FeedbackComment>(
      `/api/v1/feedback/${id}/comments`,
      files,
      commentFields(body, parentId, mentionedUserIds),
      "attachments"
    ),

  setLink: (projectId: string, enabled: boolean) =>
    wrapCall<{ feedbackToken: string | null }>("POST", `/api/v1/feedback/projects/${projectId}/link`, { enabled }),

  // IT support portal (it_support role) — the supporter's own company queue.
  supportQueue: (params: SupportQueueParams) =>
    wrapCall<Feedback[]>("GET", "/api/v1/support/feedback", params as unknown as Record<string, unknown>),

  // Leads only (server-enforced) — teammates within the supporter's own company.
  supportTeammates: () =>
    wrapCall<Supporter[]>("GET", "/api/v1/support/feedback/teammates"),

  // Leads only (server-enforced) — route an item to a teammate, or pass
  // supporterId: null to unassign.
  supportAssign: (id: string, supporterId: string | null) =>
    wrapCall<Feedback>("PATCH", `/api/v1/support/feedback/${id}/assign`, { supporterId }),

  // Working-stage progression (logged → acknowledged → investigating). note
  // is optional — emailed to the submitter alongside the stage-change copy.
  supportUpdateStatus: (id: string, supportStatus: string, note?: string) =>
    wrapCall<Feedback>("PATCH", `/api/v1/support/feedback/${id}`, {
      supportStatus,
      ...(note ? { note } : {}),
    }),

  supportHistory: (id: string) =>
    wrapCall<FeedbackStatusHistoryEntry[]>("GET", `/api/v1/support/feedback/${id}/history`),

  supportResolve: (id: string, note: string) =>
    wrapCall<Feedback>("POST", `/api/v1/support/feedback/${id}/resolve`, { note }),

  supportEscalate: (id: string, severity: FeedbackSeverity, note?: string) =>
    wrapCall<Feedback>("POST", `/api/v1/support/feedback/${id}/escalate`, {
      severity,
      ...(note ? { note } : {}),
    }),

  supportNotifySubmitter: (id: string, note: string) =>
    wrapCall<Feedback>("POST", `/api/v1/support/feedback/${id}/notify-submitter`, { note }),

  supportAddComment: (
    id: string,
    body: string,
    files: File[] = [],
    parentId?: string,
    mentionedUserIds?: string[]
  ) =>
    uploadFilesWithFields<FeedbackComment>(
      `/api/v1/support/feedback/${id}/comments`,
      files,
      commentFields(body, parentId, mentionedUserIds),
      "attachments"
    ),

  // Public (unauthenticated)
  publicForm: (token: string) =>
    wrapCall<PublicFeedbackForm>("GET", `/api/v1/public/feedback/${token}`),

  // Multipart: text fields + up to 5 optional screenshots under `images`.
  publicSubmit: (token: string, { images = [], ...fields }: SubmitPublicFeedbackPayload) => {
    const textFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined && v !== "")
    ) as Record<string, string>
    return uploadFilesWithFields<{ id: string }>(
      `/api/v1/public/feedback/${token}`,
      images,
      textFields
    )
  },

  // A submitter's own ticket history, no account — email a code, then trade
  // it for the list. The code is reusable until it expires (not single-use),
  // so MyTicketsPage can silently re-fetch on refresh. Never reveals whether
  // the email has tickets.
  requestMyTicketsCode: (email: string) =>
    wrapCall<null>("POST", "/api/v1/public/feedback/my-tickets/code", { email }),

  listMyTickets: (email: string, code: string) =>
    wrapCall<MyTicket[]>("POST", "/api/v1/public/feedback/my-tickets", { email, code }),

  // A resolved ticket's one-time satisfaction rating (1-5) — same email/code
  // proof of ownership as the list above.
  submitRating: (id: string, email: string, code: string, rating: number) =>
    wrapCall<MyTicket>("POST", `/api/v1/public/feedback/${id}/rating`, { email, code, rating }),

  // Ticket comment thread, submitter side — write only (reads are the same
  // realtime Firestore listener staff use). Proves ownership with the same
  // email + code pair as the My Tickets lookup above (sent in the body, same
  // as everywhere else that credential is used).
  // Emails the whole thread (original message + every reply) to the ticket's
  // own address — same email + code proof. timeZone only formats timestamps.
  publicEmailTranscript: (id: string, email: string, code: string, timeZone?: string) =>
    wrapCall<null>("POST", `/api/v1/public/feedback/${id}/transcript`, { email, code, timeZone }),

  publicAddComment: (id: string, email: string, code: string, body: string, files: File[] = []) =>
    uploadFilesWithFields<FeedbackComment>(
      `/api/v1/public/feedback/${id}/comments`,
      files,
      { email, code, body },
      "attachments"
    ),
}

// endpoints/feedback.endpoints.ts
import { wrapCall, uploadFilesWithFields } from "@/transport/http"
import type {
  Feedback,
  FeedbackComment,
  FeedbackConfirmationContext,
  FeedbackSeverity,
  FeedbackStatusHistoryEntry,
  FetchFeedbackParams,
  ManageFeedbackPayload,
  MyTicket,
  PublicFeedbackForm,
  SubmitPublicFeedbackPayload,
  SupportQueueParams,
} from "@/types/feedback.types"
import type { Supporter } from "@/types/clientCompany.types"

export const FeedbackEndpoints = {
  fetchAll: (params: FetchFeedbackParams) =>
    wrapCall<Feedback[]>("GET", "/api/v1/feedback", params as unknown as Record<string, unknown>),

  manage: (id: string, payload: ManageFeedbackPayload) =>
    wrapCall<Feedback>("PATCH", `/api/v1/feedback/${id}`, payload as unknown as Record<string, unknown>),

  remove: (id: string) =>
    wrapCall<null>("DELETE", `/api/v1/feedback/${id}`),

  history: (id: string) =>
    wrapCall<FeedbackStatusHistoryEntry[]>("GET", `/api/v1/feedback/${id}/history`),

  // Ticket comment thread — same shape reused for the product-team routes
  // and the IT-support portal routes below (the server resolves which tier
  // owns the ticket).
  comments: (id: string) =>
    wrapCall<FeedbackComment[]>("GET", `/api/v1/feedback/${id}/comments`),

  addComment: (id: string, body: string, files: File[] = []) =>
    uploadFilesWithFields<FeedbackComment>(
      `/api/v1/feedback/${id}/comments`,
      files,
      { body },
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

  supportComments: (id: string) =>
    wrapCall<FeedbackComment[]>("GET", `/api/v1/support/feedback/${id}/comments`),

  supportAddComment: (id: string, body: string, files: File[] = []) =>
    uploadFilesWithFields<FeedbackComment>(
      `/api/v1/support/feedback/${id}/comments`,
      files,
      { body },
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

  // Public confirmation link (from the "awaiting confirmation" status email).
  confirmationContext: (id: string) =>
    wrapCall<FeedbackConfirmationContext>("GET", `/api/v1/public/feedback/${id}/confirm`),

  submitConfirmation: (id: string, confirmed: boolean, reason?: string) =>
    wrapCall<{ status: string }>("POST", `/api/v1/public/feedback/${id}/confirm`, { confirmed, reason }),

  // A submitter's own ticket history, no account — email a code, then trade
  // it for the list. The code is reusable until it expires (not single-use),
  // so MyTicketsPage can silently re-fetch on refresh. Never reveals whether
  // the email has tickets.
  requestMyTicketsCode: (email: string) =>
    wrapCall<null>("POST", "/api/v1/public/feedback/my-tickets/code", { email }),

  listMyTickets: (email: string, code: string) =>
    wrapCall<MyTicket[]>("POST", "/api/v1/public/feedback/my-tickets", { email, code }),

  // Ticket comment thread, submitter side — proves ownership with the same
  // email + code pair as the My Tickets lookup above (sent in the body, same
  // as everywhere else that credential is used).
  publicComments: (id: string, email: string, code: string) =>
    wrapCall<FeedbackComment[]>("POST", `/api/v1/public/feedback/${id}/comments/view`, { email, code }),

  publicAddComment: (id: string, email: string, code: string, body: string, files: File[] = []) =>
    uploadFilesWithFields<FeedbackComment>(
      `/api/v1/public/feedback/${id}/comments`,
      files,
      { email, code, body },
      "attachments"
    ),
}

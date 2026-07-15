// endpoints/feedback.endpoints.ts
import { wrapCall, uploadFilesWithFields } from "@/transport/http"
import type {
  Feedback,
  FeedbackConfirmationContext,
  FeedbackSeverity,
  FeedbackStatusHistoryEntry,
  FetchFeedbackParams,
  ManageFeedbackPayload,
  PublicFeedbackForm,
  SubmitPublicFeedbackPayload,
  SupportQueueParams,
} from "@/types/feedback.types"

export const FeedbackEndpoints = {
  fetchAll: (params: FetchFeedbackParams) =>
    wrapCall<Feedback[]>("GET", "/api/v1/feedback", params as unknown as Record<string, unknown>),

  manage: (id: string, payload: ManageFeedbackPayload) =>
    wrapCall<Feedback>("PATCH", `/api/v1/feedback/${id}`, payload as unknown as Record<string, unknown>),

  remove: (id: string) =>
    wrapCall<null>("DELETE", `/api/v1/feedback/${id}`),

  history: (id: string) =>
    wrapCall<FeedbackStatusHistoryEntry[]>("GET", `/api/v1/feedback/${id}/history`),

  setLink: (projectId: string, enabled: boolean) =>
    wrapCall<{ feedbackToken: string | null }>("POST", `/api/v1/feedback/projects/${projectId}/link`, { enabled }),

  // IT support portal (it_support role) — the supporter's own company queue.
  supportQueue: (params: SupportQueueParams) =>
    wrapCall<Feedback[]>("GET", "/api/v1/support/feedback", params as unknown as Record<string, unknown>),

  // Working-stage progression (logged → acknowledged → investigating).
  supportUpdateStatus: (id: string, supportStatus: string) =>
    wrapCall<Feedback>("PATCH", `/api/v1/support/feedback/${id}`, { supportStatus }),

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
}

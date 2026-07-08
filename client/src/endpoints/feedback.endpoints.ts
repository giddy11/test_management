// endpoints/feedback.endpoints.ts
import { wrapCall, uploadFilesWithFields } from "@/transport/http"
import type {
  Feedback,
  FetchFeedbackParams,
  ManageFeedbackPayload,
  PublicFeedbackForm,
  SubmitPublicFeedbackPayload,
} from "@/types/feedback.types"

export const FeedbackEndpoints = {
  fetchAll: (params: FetchFeedbackParams) =>
    wrapCall<Feedback[]>("GET", "/api/v1/feedback", params as unknown as Record<string, unknown>),

  manage: (id: string, payload: ManageFeedbackPayload) =>
    wrapCall<Feedback>("PATCH", `/api/v1/feedback/${id}`, payload as unknown as Record<string, unknown>),

  setLink: (projectId: string, enabled: boolean) =>
    wrapCall<{ feedbackToken: string | null }>("POST", `/api/v1/feedback/projects/${projectId}/link`, { enabled }),

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
}

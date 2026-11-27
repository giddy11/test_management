// endpoints/reviewPrompt.endpoints.ts
import { wrapCall } from "@/transport/http"
import type {
  Reminder,
  ReviewAnswer,
  ReviewItemType,
  ReviewPromptSettings,
} from "@/types/reviewPrompt.types"

const REVIEW_PATHS: Record<ReviewItemType, string> = {
  bug: "/api/v1/bugs",
  feature_request: "/api/v1/feature-requests",
}

export const ReviewPromptEndpoints = {
  /** What to remind this user about now; empty unless one is due. Starts the interval. */
  claim: () => wrapCall<Reminder>("POST", "/api/v1/review-prompts/claim"),
  answer: (type: ReviewItemType, id: string, answer: ReviewAnswer) =>
    wrapCall<unknown>("POST", `${REVIEW_PATHS[type]}/${id}/review`, { ...answer }),
  /** Assignee only: marks their bug Fixed, or their request Ready For Review. */
  submitForReview: (type: ReviewItemType, id: string) =>
    wrapCall<unknown>("POST", `${REVIEW_PATHS[type]}/${id}/submit-for-review`),
  /** Platform owner only (reviewprompt.manage). */
  fetchSettings: () => wrapCall<ReviewPromptSettings>("GET", "/api/v1/review-prompts/settings"),
  saveSettings: (settings: { enabled: boolean; intervalHours: number }) =>
    wrapCall<ReviewPromptSettings>("PUT", "/api/v1/review-prompts/settings", { ...settings }),
}

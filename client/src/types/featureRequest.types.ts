// types/featureRequest.types.ts
import type { FeatureRequestStatus } from "@/lib/enums"

export interface FeatureRequest {
  id: string
  title: string
  description: string
  status: FeatureRequestStatus
  category: string | null
  submittedBy: { id: string; name: string } | null
  upvoteCount: number
  hasVoted: boolean
  commentCount: number
  adminResponse: string | null
  statusUpdatedAt: string | null
  createdAt: string
}

export interface FeatureRequestComment {
  id: string
  featureRequestId: string
  author: { id: string; name: string } | null
  body: string
  createdAt: string
}

export interface CreateFeatureRequestPayload {
  title: string
  description: string
  category?: string
}

export interface UpdateFeatureRequestStatusPayload {
  status?: FeatureRequestStatus
  adminResponse?: string | null
}

export interface VoteResult {
  voted: boolean
  upvoteCount: number
}

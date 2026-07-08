// types/featureRequest.types.ts
import type { FeatureRequestStatus } from "@/lib/enums"

export interface FeatureRequest {
  id: string
  projectId: string
  title: string
  description: string
  status: FeatureRequestStatus
  category: string | null
  module: string | null
  referenceLinks: string[]
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
  projectId: string
  title: string
  description: string
  category?: string
  module?: string
  referenceLinks?: string[]
}

export interface FeatureRequestAttachment {
  id: string
  featureRequestId: string
  fileName: string
  fileUrl: string
  mimeType: string
  fileSizeBytes: number
  createdAt: string
}

export interface UpdateFeatureRequestStatusPayload {
  status?: FeatureRequestStatus
  adminResponse?: string | null
}

export interface VoteResult {
  voted: boolean
  upvoteCount: number
}

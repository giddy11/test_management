// types/featureRequest.types.ts
import type { FeatureRequestStatus } from "@/lib/enums"
import type { CommentReactionSummary } from "@/lib/commentThreads"

export interface FeatureRequest {
  id: string
  referenceCode: string
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

// Which field the request list's search box is matched against.
export type FeatureRequestSearchField = "title" | "reporter"

// One status the request has entered, oldest first.
export interface FeatureRequestStatusHistoryEntry {
  status: FeatureRequestStatus
  enteredAt: string
}

export interface FeatureRequestComment {
  id: string
  featureRequestId: string
  parentId: string | null
  author: { id: string; name: string } | null
  body: string
  editedAt: string | null
  reactions: CommentReactionSummary
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

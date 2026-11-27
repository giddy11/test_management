// types/reviewPrompt.types.ts
export type ReviewItemType = "bug" | "feature_request"

interface TicketRef {
  type: ReviewItemType
  id: string
  projectId: string
  projectName: string
  referenceCode: string
  title: string
}

/** Something this user reported, waiting for their verdict. */
export interface ReviewItem extends TicketRef {
  assigneeName: string | null
  readySince: string | null
}

/** Something assigned to this user that still needs work. */
export interface WorkItem extends TicketRef {
  /** A bug status as it reads, or a feature request status code. */
  status: string
}

export interface Reminder {
  items: ReviewItem[]
  work: WorkItem[]
}

export interface ReviewAnswer {
  approved: boolean
  /** Required when not approved. */
  reason?: string
}

export interface ReviewPromptSettings {
  enabled: boolean
  intervalHours: number
  updatedAt: string | null
}

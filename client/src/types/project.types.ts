export type ProjectMemberRole = "member" | "team_lead"

export interface ProjectMember {
  id: string
  name: string
  email: string
  role: ProjectMemberRole
}

export interface Project {
  id: string
  name: string
  description: string | null
  ownerId: string
  suiteCount: number
  members?: ProjectMember[]
  feedbackToken?: string | null
  liveChatToken?: string | null
  // E.164 format. What this project's "Contact support" WhatsApp widget
  // messages — null until the team lead sets one.
  supportWhatsappNumber?: string | null
  // Only populated by the list endpoint (GET /projects) — whether the viewer
  // may edit this project (team lead, or holds project.manageall).
  canManage?: boolean
  createdAt: string
}

export interface ProjectMemberInput {
  userId: string
  role: ProjectMemberRole
}

export interface CreateProjectPayload {
  name: string
  description?: string
  members?: ProjectMemberInput[]
}

export interface UpdateProjectPayload {
  name?: string
  description?: string | null
  members?: ProjectMemberInput[]
  supportWhatsappNumber?: string | null
}

export interface FetchProjectsParams {
  page?: number
  limit?: number
  search?: string
}

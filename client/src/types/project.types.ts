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
}

export interface FetchProjectsParams {
  page?: number
  limit?: number
  search?: string
}

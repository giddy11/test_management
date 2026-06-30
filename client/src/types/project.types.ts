export interface Project {
  id: string
  name: string
  description: string | null
  ownerId: string
  suiteCount: number
  members?: { id: string; name: string; email: string }[]
  createdAt: string
}

export interface CreateProjectPayload {
  name: string
  description?: string
}

export interface UpdateProjectPayload {
  name?: string
  description?: string | null
}

export interface FetchProjectsParams {
  page?: number
  limit?: number
  search?: string
}

// endpoints/project.endpoints.ts
import { wrapCall } from "@/transport/http"
import type {
  CreateProjectPayload,
  FetchProjectsParams,
  Project,
  UpdateProjectPayload,
} from "@/types/project.types"

export const ProjectEndpoints = {
  fetchAll: (params: FetchProjectsParams) =>
    wrapCall<Project[]>("GET", "/api/v1/projects", params as Record<string, unknown>),

  fetchById: (id: string) => wrapCall<Project>("GET", `/api/v1/projects/${id}`),

  create: (payload: CreateProjectPayload) =>
    wrapCall<Project>("POST", "/api/v1/projects", payload as unknown as Record<string, unknown>),

  update: (id: string, payload: UpdateProjectPayload) =>
    wrapCall<Project>("PATCH", `/api/v1/projects/${id}`, payload as unknown as Record<string, unknown>),

  remove: (id: string) => wrapCall<null>("DELETE", `/api/v1/projects/${id}`),
}

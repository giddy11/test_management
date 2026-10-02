// hooks/useProjects.ts — React Query bridge for projects.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ProjectEndpoints } from "@/endpoints/project.endpoints"
import { ApiError } from "@/transport/http"
import { useAuth } from "@/contexts/AuthContext"
import type {
  CreateProjectPayload,
  FetchProjectsParams,
  UpdateProjectPayload,
} from "@/types/project.types"

const PROJECTS_KEY = "projects"

export function useProjects(params: FetchProjectsParams, enabled = true) {
  return useQuery({
    queryKey: [PROJECTS_KEY, params],
    queryFn: async () => {
      const res = await ProjectEndpoints.fetchAll(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
    enabled,
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: [PROJECTS_KEY, "detail", id],
    queryFn: async () => {
      const res = await ProjectEndpoints.fetchById(id)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled: Boolean(id),
  })
}

// Whether the current user can manage the given project: admins/superadmins
// always can; a regular user can when they're the project's team lead.
// Mirrors the server's ProjectService.canManageProject.
export function useCanManageProject(projectId: string) {
  const { user, can } = useAuth()
  // Org-wide project authority (project.manageall); everyone else must be that
  // project's team lead, exactly as ProjectService.canManageProject decides on
  // the server.
  const isAdmin = can("project.manageall")
  // Admins never need the membership lookup — skip the fetch.
  const { data: project } = useProject(isAdmin ? "" : projectId)
  if (isAdmin) return true
  return Boolean(project?.members?.some((m) => m.id === user?.id && m.role === "team_lead"))
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateProjectPayload) => {
      const res = await ProjectEndpoints.create(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [PROJECTS_KEY] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateProjectPayload }) => {
      const res = await ProjectEndpoints.update(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [PROJECTS_KEY] }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await ProjectEndpoints.remove(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [PROJECTS_KEY] }),
  })
}

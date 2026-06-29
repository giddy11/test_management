// hooks/useProjects.ts — React Query bridge for projects.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ProjectEndpoints } from "@/endpoints/project.endpoints"
import { ApiError } from "@/transport/http"
import type {
  CreateProjectPayload,
  FetchProjectsParams,
  UpdateProjectPayload,
} from "@/types/project.types"

const PROJECTS_KEY = "projects"

export function useProjects(params: FetchProjectsParams) {
  return useQuery({
    queryKey: [PROJECTS_KEY, params],
    queryFn: async () => {
      const res = await ProjectEndpoints.fetchAll(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
  })
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

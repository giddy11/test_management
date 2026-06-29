// hooks/useUsers.ts — React Query bridge for company member management.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { UserEndpoints } from "@/endpoints/user.endpoints"
import { ApiError } from "@/transport/http"
import type {
  CreateUserPayload,
  FetchUsersParams,
  UpdateUserPayload,
} from "@/types/user.types"

const USERS_KEY = "users"

export function useUsers(params: FetchUsersParams) {
  return useQuery({
    queryKey: [USERS_KEY, params],
    queryFn: async () => {
      const res = await UserEndpoints.fetchAll(params)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return { data: res.data ?? [], meta: res.meta }
    },
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const res = await UserEndpoints.create(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [USERS_KEY] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateUserPayload }) => {
      const res = await UserEndpoints.update(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [USERS_KEY] }),
  })
}

export function useDeactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await UserEndpoints.remove(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [USERS_KEY] }),
  })
}

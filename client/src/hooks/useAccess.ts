// hooks/useAccess.ts — React Query bridge for Roles & access.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AccessEndpoints } from "@/endpoints/access.endpoints"
import { ApiError } from "@/transport/http"
import type { CreateRolePayload, UpdateRolePayload } from "@/types/access.types"

const ROLES_KEY = ["access", "roles"] as const
const CATALOG_KEY = ["access", "permissions"] as const

export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: async () => {
      const res = await AccessEndpoints.catalog()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    enabled,
    // The catalog is code-owned and changes only on deploy.
    staleTime: 60 * 60 * 1000,
  })
}

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: ROLES_KEY,
    queryFn: async () => {
      const res = await AccessEndpoints.fetchRoles()
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled,
  })
}

// Editing a role changes what its members may do right now, so the current
// user's own permissions are refetched alongside the roles list.
function useInvalidateAccess() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ROLES_KEY })
    void qc.invalidateQueries({ queryKey: ["auth", "me"] })
  }
}

export function useCreateRole() {
  const invalidate = useInvalidateAccess()
  return useMutation({
    mutationFn: async (payload: CreateRolePayload) => {
      const res = await AccessEndpoints.createRole(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateRole() {
  const invalidate = useInvalidateAccess()
  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateRolePayload & { id: string }) => {
      const res = await AccessEndpoints.updateRole(id, payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteRole() {
  const invalidate = useInvalidateAccess()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await AccessEndpoints.deleteRole(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return id
    },
    onSuccess: invalidate,
  })
}

export function useSetUserRoles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: string; roleIds: string[] }) => {
      const res = await AccessEndpoints.setUserRoles(userId, roleIds)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    onSuccess: () => {
      // Member counts on the roles list move when an assignment changes.
      void qc.invalidateQueries({ queryKey: ROLES_KEY })
      void qc.invalidateQueries({ queryKey: ["users"] })
      void qc.invalidateQueries({ queryKey: ["auth", "me"] })
    },
  })
}

// endpoints/access.endpoints.ts — Roles & access.
import { wrapCall } from "@/transport/http"
import type {
  CreateRolePayload,
  PermissionCatalog,
  Role,
  UpdateRolePayload,
} from "@/types/access.types"

export const AccessEndpoints = {
  catalog: () => wrapCall<PermissionCatalog>("GET", "/api/v1/access/permissions"),

  fetchRoles: () => wrapCall<Role[]>("GET", "/api/v1/access/roles"),

  createRole: (payload: CreateRolePayload) =>
    wrapCall<Role>("POST", "/api/v1/access/roles", payload as unknown as Record<string, unknown>),

  updateRole: (id: string, payload: UpdateRolePayload) =>
    wrapCall<Role>("PATCH", `/api/v1/access/roles/${id}`, payload as unknown as Record<string, unknown>),

  deleteRole: (id: string) => wrapCall<null>("DELETE", `/api/v1/access/roles/${id}`),

  // Role assignment lives on the user, gated on role.assign rather than
  // user.update — see the server's user.routes.js.
  setUserRoles: (userId: string, roleIds: string[]) =>
    wrapCall<Role[]>("PUT", `/api/v1/users/${userId}/roles`, { roleIds }),
}

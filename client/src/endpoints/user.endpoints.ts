// endpoints/user.endpoints.ts — company user management API.
import { wrapCall } from "@/transport/http"
import type { User } from "@/types/auth.types"
import type {
  CreateUserPayload,
  FetchUsersParams,
  UpdateUserPayload,
} from "@/types/user.types"

export const UserEndpoints = {
  // List endpoints put the array in `data` and pagination in top-level `meta`.
  fetchAll: (params: FetchUsersParams) =>
    wrapCall<User[]>("GET", "/api/v1/users", params as Record<string, unknown>),

  create: (payload: CreateUserPayload) =>
    wrapCall<User>("POST", "/api/v1/users", payload as unknown as Record<string, unknown>),

  update: (id: string, payload: UpdateUserPayload) =>
    wrapCall<User>("PATCH", `/api/v1/users/${id}`, payload as unknown as Record<string, unknown>),

  remove: (id: string) => wrapCall<null>("DELETE", `/api/v1/users/${id}`),
}

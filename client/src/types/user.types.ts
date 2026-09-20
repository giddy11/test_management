import type { PaginationMeta } from "@/types/api.types"
import type { User } from "@/types/auth.types"

export type ManageableRole = "admin" | "user"

export interface CreateUserPayload {
  firstName: string
  lastName: string
  email: string
  password: string
  /**
   * The legacy users.role column, derived from whether the assigned roles
   * include the organisation administrator. Kept for one release while that
   * column still exists; user_roles is the source of truth.
   */
  role: ManageableRole
  /** Roles to grant the new account — the real access decision. */
  roleIds?: string[]
}

export interface UpdateUserPayload {
  firstName?: string
  lastName?: string
  role?: ManageableRole
}

export interface FetchUsersParams {
  page?: number
  limit?: number
  search?: string
}

export interface PaginatedUsers {
  data: User[]
  meta: PaginationMeta
}

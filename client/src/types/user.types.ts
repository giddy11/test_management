import type { PaginationMeta } from "@/types/api.types"
import type { User } from "@/types/auth.types"

export type ManageableRole = "admin" | "user"

export interface CreateUserPayload {
  firstName: string
  lastName: string
  email: string
  password: string
  role: ManageableRole
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

// types/access.types.ts — Roles & access.
//
// Permission codes are plain strings on purpose: the catalog lives on the
// server and is fetched, so adding a permission never needs a client release.

export interface Permission {
  code: string
  category: string
  label: string
  description: string | null
  /** Amber note shown under the checkbox, e.g. "Can grant any permission". */
  warning: string | null
}

export interface PermissionCategory {
  key: string
  label: string
  description: string | null
}

export interface PermissionCatalog {
  categories: PermissionCategory[]
  permissions: Permission[]
}

export interface Role {
  id: string
  /** Stable seed key for built-in roles; null on custom ones. */
  key: string | null
  name: string
  description: string | null
  isBuiltin: boolean
  isLocked: boolean
  permissions: string[]
  permissionCount: number
  /** Shown as "N permissions · M members" so an edit's impact is visible first. */
  memberCount: number
}

export interface CreateRolePayload {
  name: string
  description?: string
  permissions?: string[]
  cloneFromId?: string
}

export interface UpdateRolePayload {
  name?: string
  description?: string | null
  permissions?: string[]
}

// The subset of a role the /auth/me payload carries.
export interface AssignedRole {
  id: string
  name: string
  isBuiltin: boolean
  isLocked: boolean
}

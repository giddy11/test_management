// types/auth.types.ts

export const UserRole = {
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  USER: "user",
  // External IT supporter at a client company — only sees the support portal.
  IT_SUPPORT: "it_support",
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export interface User {
  id: string
  firstName: string
  lastName: string
  name: string
  companyName: string | null
  email: string
  isEmailVerified: boolean
  onboardingCompleted: boolean
  role: UserRole
  // Set only on it_support accounts — the client company they belong to.
  clientCompanyId?: string | null
  // Set only on it_support accounts — can assign queue items to teammates.
  isSupportLead?: boolean
  isOrgOwner?: boolean
  provider: string
  avatarUrl: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  createdAt: string
  lastSeenAt: string | null
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface AuthResult {
  user: User
  tokens: AuthTokens
}

export interface RegisterPayload {
  firstName: string
  lastName: string
  companyName: string
  email: string
  password: string
  address?: string
  city?: string
  state?: string
  country?: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface UpdateProfilePayload {
  firstName?: string
  lastName?: string
  email?: string
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

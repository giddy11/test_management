// contexts/AuthContext.tsx — global auth state (the one piece of genuinely global server data).
import { createContext, useContext, useCallback, useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AuthEndpoints } from "@/endpoints/auth.endpoints"
import { tokenStorage } from "@/lib/storage"
import { UserRole, type AuthResult, type User } from "@/types/auth.types"
import { useRoles } from "@/hooks/useAccess"
import { can as canCheck } from "@/lib/can"

interface AuthContextValue {
  // Effective user — reflects the preview role when previewing, so every
  // existing role check in the app (nav, routes, guides, canManage…) sees a
  // faithful lower-role view without needing its own preview-aware logic.
  user: User | null
  // The actual authenticated user, unaffected by preview — use this for
  // anything that must keep working while previewing (e.g. exiting preview).
  realUser: User | null
  isLoading: boolean
  isAuthenticated: boolean
  setSession: (result: AuthResult) => void
  clearSession: () => void
  /**
   * The effective user permissions, resolved by the server on every request.
   * FOR USABILITY ONLY — the API re-checks each one; see docs/access-model.md.
   */
  permissions: string[]
  can: (code: string) => boolean
  previewRole: UserRole | null
  isPreviewing: boolean
  startPreview: (role: UserRole) => void
  exitPreview: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ME_KEY = ["auth", "me"] as const

// Only strictly-lower roles are previewable, and only by admins/superadmins.
// eslint-disable-next-line react-refresh/only-export-components
export const PREVIEWABLE_ROLES: Record<UserRole, UserRole[]> = {
  [UserRole.SUPERADMIN]: [UserRole.ADMIN, UserRole.USER],
  [UserRole.ADMIN]: [UserRole.USER],
  [UserRole.USER]: [],
  // Supporters can't preview, and nobody previews as one — the portal is
  // scoped to a real clientCompanyId a previewer wouldn't have.
  [UserRole.IT_SUPPORT]: [],
}

// Which built-in role a previewed legacy role resolves to, so the preview
// borrows that role's real permission set instead of the previewer's own.
// Keys match roles.key on the server (see permissions.catalog.js).
const PREVIEW_ROLE_KEYS: Partial<Record<UserRole, string>> = {
  [UserRole.ADMIN]: "org_admin",
  [UserRole.USER]: "qa_engineer",
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null)

  // Hydrate the current user from /me whenever an access token is present.
  const { data: realUser, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      const res = await AuthEndpoints.me()
      if (!res.success || !res.data) throw new Error(res.message)
      return res.data
    },
    enabled: Boolean(tokenStorage.getAccess()),
  })

  const setSession = useCallback(
    (result: AuthResult) => {
      tokenStorage.set(result.tokens.accessToken, result.tokens.refreshToken)
      queryClient.setQueryData(ME_KEY, result.user)
    },
    [queryClient]
  )

  const clearSession = useCallback(() => {
    const refresh = tokenStorage.getRefresh()
    if (refresh) void AuthEndpoints.logout(refresh).catch(() => undefined)
    tokenStorage.clear()
    queryClient.setQueryData(ME_KEY, null)
    queryClient.removeQueries({ queryKey: ME_KEY })
    setPreviewRole(null)
  }, [queryClient])

  const startPreview = useCallback(
    (role: UserRole) => {
      if (!realUser || !PREVIEWABLE_ROLES[realUser.role]?.includes(role)) return
      setPreviewRole(role)
    },
    [realUser]
  )

  const exitPreview = useCallback(() => setPreviewRole(null), [])

  // Previewing has to swap the PERMISSIONS too, or the preview would show a
  // lower role's navigation while still revealing every admin control. Roles
  // are data now, so the previewed set comes from the real roles list rather
  // than a second copy of the catalog on the client. Fetched only while
  // previewing — a normal session never pays for this.
  const { data: roles } = useRoles(Boolean(previewRole))
  const previewedRoleKey = previewRole ? PREVIEW_ROLE_KEYS[previewRole] : null
  const previewedPermissions = previewedRoleKey
    ? (roles?.find((r) => r.key === previewedRoleKey)?.permissions ?? null)
    : null

  // An org owner can never actually hold the previewed (lower) role, so drop
  // the flag to keep the preview faithful to what that role really sees.
  const effectiveUser: User | null =
    realUser && previewRole
      ? {
          ...realUser,
          role: previewRole,
          isOrgOwner: false,
          // Until the roles list arrives, show nothing rather than the
          // previewer's own admin permissions — erring towards hiding is the
          // honest direction for a preview.
          permissions: previewedPermissions ?? [],
        }
      : (realUser ?? null)

  // Memoised so `can` keeps a stable identity — it ends up in the dependency
  // list of effects all over the app.
  const permissions = useMemo(
    () => effectiveUser?.permissions ?? [],
    [effectiveUser?.permissions]
  )
  const can = useCallback((code: string) => canCheck(permissions, code), [permissions])

  const value: AuthContextValue = {
    user: effectiveUser,
    realUser: realUser ?? null,
    isLoading: Boolean(tokenStorage.getAccess()) && isLoading,
    isAuthenticated: Boolean(realUser),
    permissions,
    can,
    setSession,
    clearSession,
    previewRole,
    isPreviewing: Boolean(previewRole),
    startPreview,
    exitPreview,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}

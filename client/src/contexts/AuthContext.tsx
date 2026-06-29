// contexts/AuthContext.tsx — global auth state (the one piece of genuinely global server data).
import { createContext, useContext, useCallback, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AuthEndpoints } from "@/endpoints/auth.endpoints"
import { tokenStorage } from "@/lib/storage"
import type { AuthResult, User } from "@/types/auth.types"

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  setSession: (result: AuthResult) => void
  clearSession: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ME_KEY = ["auth", "me"] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // Hydrate the current user from /me whenever an access token is present.
  const { data: user, isLoading } = useQuery({
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
  }, [queryClient])

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading: Boolean(tokenStorage.getAccess()) && isLoading,
    isAuthenticated: Boolean(user),
    setSession,
    clearSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}

// lib/storage.ts — single source of truth for auth token persistence (web: localStorage).

const ACCESS_KEY = "tm_access_token"
const REFRESH_KEY = "tm_refresh_token"

export const tokenStorage = {
  getAccess: (): string | null => localStorage.getItem(ACCESS_KEY),
  getRefresh: (): string | null => localStorage.getItem(REFRESH_KEY),

  set: (accessToken: string, refreshToken: string): void => {
    localStorage.setItem(ACCESS_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
  },

  clear: (): void => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

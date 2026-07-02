// endpoints/auth.endpoints.ts — typed auth API functions. UI never calls wrapCall directly.
import { wrapCall } from "@/transport/http"
import type {
  AuthResult,
  ChangePasswordPayload,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
  User,
} from "@/types/auth.types"

export const AuthEndpoints = {
  register: (payload: RegisterPayload) =>
    wrapCall<AuthResult>("POST", "/api/v1/auth/register", payload as unknown as Record<string, unknown>),

  login: (payload: LoginPayload) =>
    wrapCall<AuthResult>("POST", "/api/v1/auth/login", payload as unknown as Record<string, unknown>),

  google: (idToken: string) =>
    wrapCall<AuthResult>("POST", "/api/v1/auth/google", { idToken }),

  logout: (refreshToken: string) =>
    wrapCall<null>("POST", "/api/v1/auth/logout", { refreshToken }),

  me: () => wrapCall<User>("GET", "/api/v1/auth/me"),

  verifyEmail: (email: string, code: string) =>
    wrapCall<User>("POST", "/api/v1/auth/verify-email", { email, code }),

  resendVerification: (email: string) =>
    wrapCall<null>("POST", "/api/v1/auth/resend-verification", { email }),

  forgotPassword: (email: string) =>
    wrapCall<null>("POST", "/api/v1/auth/forgot-password", { email }),

  resetPassword: (email: string, code: string, newPassword: string) =>
    wrapCall<null>("POST", "/api/v1/auth/reset-password", { email, code, newPassword }),

  changePassword: (payload: ChangePasswordPayload) =>
    wrapCall<null>("PATCH", "/api/v1/auth/change-password", payload as unknown as Record<string, unknown>),

  updateProfile: (payload: UpdateProfilePayload) =>
    wrapCall<User>("PATCH", "/api/v1/auth/profile", payload as unknown as Record<string, unknown>),

  updateOnboarding: (completed: boolean) =>
    wrapCall<User>("PATCH", "/api/v1/auth/onboarding", { completed }),
}

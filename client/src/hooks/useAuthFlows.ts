// hooks/useAuthFlows.ts — email verification + password reset (React Query mutations).
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { AuthEndpoints } from "@/endpoints/auth.endpoints"
import { ApiError } from "@/transport/http"

const ME_KEY = ["auth", "me"] as const

export function useVerifyEmail() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      const res = await AuthEndpoints.verifyEmail(email, code)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: (user) => {
      // Refresh the cached user so the verified flag flips and the guard passes.
      qc.setQueryData(ME_KEY, user)
      navigate("/dashboard", { replace: true })
    },
  })
}

export function useResendVerification() {
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await AuthEndpoints.resendVerification(email)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
  })
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await AuthEndpoints.forgotPassword(email)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({
      email,
      code,
      newPassword,
    }: {
      email: string
      code: string
      newPassword: string
    }) => {
      const res = await AuthEndpoints.resetPassword(email, code, newPassword)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
  })
}

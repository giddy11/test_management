// hooks/useAuth.ts — React Query mutations bridging the auth endpoints and AuthContext.
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { AuthEndpoints } from "@/endpoints/auth.endpoints"
import { useAuth } from "@/contexts/AuthContext"
import { ApiError } from "@/transport/http"
import type { LoginPayload, RegisterPayload } from "@/types/auth.types"

export function useLogin() {
  const { setSession } = useAuth()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const res = await AuthEndpoints.login(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: (data) => {
      setSession(data)
      navigate("/dashboard", { replace: true })
    },
  })
}

export function useRegister() {
  const { setSession } = useAuth()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      const res = await AuthEndpoints.register(payload)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: (data) => {
      // Signed in, but unverified — send them to verify their email first.
      setSession(data)
      navigate("/verify-email", { replace: true, state: { email: data.user.email } })
    },
  })
}

export function useGoogleLogin() {
  const { setSession } = useAuth()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (idToken: string) => {
      const res = await AuthEndpoints.google(idToken)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: (data) => {
      setSession(data)
      navigate("/dashboard", { replace: true })
    },
  })
}

export function useLogout() {
  const { clearSession } = useAuth()
  const navigate = useNavigate()

  return () => {
    clearSession()
    navigate("/login", { replace: true })
  }
}

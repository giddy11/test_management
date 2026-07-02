// hooks/useOnboarding.ts — mutates the persisted onboarding_completed flag.
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AuthEndpoints } from "@/endpoints/auth.endpoints"
import { ApiError } from "@/transport/http"

const ME_KEY = ["auth", "me"] as const

export function useUpdateOnboardingStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (completed: boolean) => {
      const res = await AuthEndpoints.updateOnboarding(completed)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user)
    },
  })
}

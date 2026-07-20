// hooks/useNotificationSoundSetting.ts — mutates the persisted alert-tone preference.
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AuthEndpoints } from "@/endpoints/auth.endpoints"
import { ApiError } from "@/transport/http"

const ME_KEY = ["auth", "me"] as const

export function useUpdateNotificationSoundSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await AuthEndpoints.updateNotificationSound(enabled)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user)
    },
  })
}

// hooks/useNotificationSoundSetting.ts — mutates the persisted alert-tone and
// per-area notification preferences.
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AuthEndpoints } from "@/endpoints/auth.endpoints"
import { ApiError } from "@/transport/http"
import { applyPreferencePatch } from "@/lib/notificationPreferences"
import type { NotificationPreferences, User } from "@/types/auth.types"

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

// Optimistic: the checkbox flips at once and rolls back if the save fails.
// One scope so quick successive toggles save in order — the server merges
// each patch over what's stored, and parallel saves could drop one.
export function useUpdateNotificationPreferences() {
  const qc = useQueryClient()
  return useMutation({
    scope: { id: "notification-preferences" },
    mutationFn: async (patch: NotificationPreferences) => {
      const res = await AuthEndpoints.updateNotificationPreferences(patch)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ME_KEY })
      const previous = qc.getQueryData<User>(ME_KEY)
      if (previous) {
        qc.setQueryData<User>(ME_KEY, {
          ...previous,
          notificationPreferences: applyPreferencePatch(previous.notificationPreferences, patch),
        })
      }
      return { previous }
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(ME_KEY, ctx.previous)
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user)
    },
  })
}

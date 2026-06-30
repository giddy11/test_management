import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { NotificationEndpoints } from "@/endpoints/notification.endpoints"
import { ApiError } from "@/transport/http"
import type { AppNotification } from "@/types/notification.types"

const LIST_KEY = ["notifications", "list"]
const COUNT_KEY = ["notifications", "unread-count"]

export function useUnreadCount() {
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: async () => {
      const res = await NotificationEndpoints.unreadCount()
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode)
      return res.data.count
    },
    refetchInterval: 30_000, // poll every 30s
    refetchOnWindowFocus: true,
  })
}

export function useNotifications(open: boolean) {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const res = await NotificationEndpoints.fetchAll({ page: 1, limit: 20 })
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: open, // only fetch the list when the dropdown is open
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await NotificationEndpoints.markRead(id)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    // Update the bell + list immediately on click.
    onMutate: (id) => {
      const list = qc.getQueryData<AppNotification[]>(LIST_KEY)
      const wasUnread = list?.some((n) => n.id === id && !n.read) ?? false
      if (wasUnread) {
        qc.setQueryData<number>(COUNT_KEY, (c) => Math.max(0, (c ?? 1) - 1))
      }
      if (list) {
        qc.setQueryData<AppNotification[]>(
          LIST_KEY,
          list.map((n) => (n.id === id ? { ...n, read: true } : n))
        )
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: COUNT_KEY })
      qc.invalidateQueries({ queryKey: LIST_KEY })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await NotificationEndpoints.markAllRead()
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onMutate: () => {
      qc.setQueryData<number>(COUNT_KEY, 0)
      const list = qc.getQueryData<AppNotification[]>(LIST_KEY)
      if (list) qc.setQueryData(LIST_KEY, list.map((n) => ({ ...n, read: true })))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: COUNT_KEY })
      qc.invalidateQueries({ queryKey: LIST_KEY })
    },
  })
}

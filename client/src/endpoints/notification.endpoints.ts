// endpoints/notification.endpoints.ts
import { wrapCall } from "@/transport/http"
import type { AppNotification } from "@/types/notification.types"

export const NotificationEndpoints = {
  fetchAll: (params: { page?: number; limit?: number }) =>
    wrapCall<AppNotification[]>("GET", "/api/v1/notifications", params as Record<string, unknown>),
  unreadCount: () =>
    wrapCall<{ count: number }>("GET", "/api/v1/notifications/unread-count"),
  markRead: (id: string) =>
    wrapCall<null>("PATCH", `/api/v1/notifications/${id}/read`),
  markAllRead: () => wrapCall<null>("PATCH", "/api/v1/notifications/read-all"),
}

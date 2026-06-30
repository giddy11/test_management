// modules/notification/dto/notification.dto.js

function toNotificationResponse(n) {
  if (!n) return null;
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    data: n.data ?? null,
    read: Boolean(n.readAt),
    createdAt: n.createdAt,
  };
}

module.exports = { toNotificationResponse };

// modules/supportChat/dto/supportChat.dto.js

function toConversationResponse(c) {
  if (!c) return null;
  const user = c.user;
  return {
    id: c.id,
    user: user
      ? {
          id: user.id,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
          email: user.email,
        }
      : null,
    status: c.status,
    lastMessageAt: c.lastMessageAt ?? null,
    lastMessagePreview: c.lastMessagePreview ?? null,
    lastSenderRole: c.lastSenderRole ?? null,
    userUnread: c.userUnread ?? 0,
    adminUnread: c.adminUnread ?? 0,
    createdAt: c.createdAt,
  };
}

// Firestore has no join — authorId/authorName/authorRole are denormalized onto the doc.
function toMessageResponse(m) {
  if (!m) return null;
  return {
    id: m.id,
    conversationId: m.conversationId,
    author: m.authorId ? { id: m.authorId, name: m.authorName || "Deleted user" } : null,
    authorRole: m.authorRole ?? null,
    body: m.body,
    attachments: (m.attachments ?? []).map((a) => ({
      url: a.url,
      name: a.name ?? null,
      mimeType: a.mimeType ?? null,
      bytes: a.bytes ?? null,
    })),
    createdAt: m.createdAt,
  };
}

module.exports = { toConversationResponse, toMessageResponse };

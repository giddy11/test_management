// modules/supportChat/repositories/supportChatMessage.repository.js
// Messages live in Firestore (realtime), not Postgres — same pattern as
// featureRequestComment.repository.js. The server (Admin SDK) is the only
// writer; clients read live via an onSnapshot listener.
const { getFirestore, FieldValue } = require("../../../infrastructure/firestore/firestoreClient");
const { buildMeta } = require("../../../shared/pagination/paginate");
const { AppError } = require("../../../shared/errors/AppError");

const COLLECTION = "supportChatMessages";

function toMessage(snap) {
  const data = snap.data();
  return {
    id: snap.id,
    conversationId: data.conversationId,
    authorId: data.authorId ?? null,
    authorName: data.authorName ?? null,
    authorRole: data.authorRole ?? null,
    body: data.body,
    // [{ url, publicId, name, mimeType, bytes }] — image attachments (may be empty).
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    createdAt: data.createdAt ? data.createdAt.toDate() : null,
    deletedAt: data.deletedAt ? data.deletedAt.toDate() : null,
  };
}

// Firestore init/connection failures must not crash the request — surfaced as a
// clear 503 instead (mirrors the feature-request comment repo).
function unavailable(err) {
  console.error("[supportChatMessages] Firestore error:", err.message);
  return new AppError("Support chat is temporarily unavailable", 503);
}

class SupportChatMessageRepository {
  static Instance = new SupportChatMessageRepository();

  // Non-realtime fallback (the web app uses an onSnapshot listener instead).
  // Returns the first `limit` messages oldest-first; Firestore has no OFFSET so
  // deep pagination isn't supported.
  async fetchPaginated(conversationId, { page = 1, limit = 50 }) {
    try {
      const base = getFirestore()
        .collection(COLLECTION)
        .where("conversationId", "==", conversationId)
        .where("deletedAt", "==", null);

      const [snap, countSnap] = await Promise.all([
        base.orderBy("createdAt", "asc").limit(limit).get(),
        base.count().get(),
      ]);

      const data = snap.docs.map(toMessage);
      const total = countSnap.data().count;
      return { data, meta: buildMeta(page, limit, total, data.length) };
    } catch (err) {
      throw unavailable(err);
    }
  }

  // data: { conversationId, authorId, authorName, authorRole, body, attachments? }
  async create(data) {
    try {
      const ref = await getFirestore().collection(COLLECTION).add({
        conversationId: data.conversationId,
        authorId: data.authorId ?? null,
        authorName: data.authorName ?? null,
        authorRole: data.authorRole ?? null,
        body: data.body,
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        createdAt: FieldValue.serverTimestamp(),
        deletedAt: null,
      });
      const snap = await ref.get();
      return toMessage(snap);
    } catch (err) {
      throw unavailable(err);
    }
  }
}

module.exports = { SupportChatMessageRepository };

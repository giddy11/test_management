// modules/liveChat/repositories/liveChatMessage.repository.ts
// A conversation's messages live in Firestore (realtime), not Postgres — same
// split as support-chat messages and feature-request comments. The server
// (Admin SDK) is the only writer; clients (the widget and the operator inbox
// alike) read live via an onSnapshot listener, gated only by Firestore's
// "must be signed in (even anonymously)" rule — see firestore.rules. The
// widget signs the visitor in anonymously via Firebase client auth, same as
// an unauthenticated feedback-ticket submitter.
import { AppError } from "../../../shared/errors/AppError";

const { getFirestore, FieldValue } = require("../../../infrastructure/firestore/firestoreClient");
const { buildMeta } = require("../../../shared/pagination/paginate");

const COLLECTION = "liveChatMessages";

export interface LiveChatMessageAttachment {
  url: string;
  publicId: string;
  name: string;
  mimeType: string;
  bytes: number;
}

export interface LiveChatMessage {
  id: string;
  conversationId: string;
  authorId: string | null; // the agent's user id; null for a visitor or the bot
  authorName: string | null;
  authorRole: string | null; // "visitor" | "agent" | "bot"
  body: string;
  attachments: LiveChatMessageAttachment[];
  createdAt: Date | null;
  deletedAt: Date | null;
}

function toMessage(snap: any): LiveChatMessage {
  const data = snap.data() as any;
  return {
    id: snap.id,
    conversationId: data.conversationId,
    authorId: data.authorId ?? null,
    authorName: data.authorName ?? null,
    authorRole: data.authorRole ?? null,
    body: data.body,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    createdAt: data.createdAt ? data.createdAt.toDate() : null,
    deletedAt: data.deletedAt ? data.deletedAt.toDate() : null,
  };
}

// Firestore init/connection failures must not crash the request — surfaced as
// a clear 503 instead (mirrors supportChatMessage.repository.js).
function unavailable(err: Error): AppError {
  console.error("[liveChatMessages] Firestore error:", err.message);
  return new AppError("Live chat is temporarily unavailable", 503);
}

export class LiveChatMessageRepository {
  static Instance = new LiveChatMessageRepository();

  // Non-realtime fallback (the widget/inbox use an onSnapshot listener
  // instead). Returns the first `limit` messages oldest-first; Firestore has
  // no OFFSET so deep pagination isn't supported.
  async fetchPaginated(conversationId: string, { page = 1, limit = 50 } = {}) {
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
      throw unavailable(err as Error);
    }
  }

  async create(data: {
    conversationId: string;
    authorId?: string | null;
    authorName?: string | null;
    authorRole?: string | null;
    body: string;
    attachments?: LiveChatMessageAttachment[];
  }): Promise<LiveChatMessage> {
    try {
      const ref = await getFirestore()
        .collection(COLLECTION)
        .add({
          conversationId: data.conversationId,
          authorId: data.authorId ?? null,
          authorName: data.authorName ?? null,
          authorRole: data.authorRole ?? null,
          body: data.body,
          attachments: data.attachments ?? [],
          createdAt: FieldValue.serverTimestamp(),
          deletedAt: null,
        });
      const snap = await ref.get();
      return toMessage(snap);
    } catch (err) {
      throw unavailable(err as Error);
    }
  }
}

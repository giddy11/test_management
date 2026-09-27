// modules/feedback/repositories/feedbackComment.repository.ts
// A ticket's comment thread lives in Firestore (realtime), not Postgres —
// same split as feature-request comments and support-chat messages. The
// server (Admin SDK) is the only writer; clients (staff and the anonymous
// submitter alike) read live via an onSnapshot listener, gated only by
// Firestore's "must be signed in (even anonymously)" rule — see
// firestore.rules. No delete/edit support (a support thread is an append-only
// log), so unlike the sibling repos there's no deletedAt field/filter.
import { AppError } from "../../../shared/errors/AppError";

const { getFirestore, FieldValue } = require("../../../infrastructure/firestore/firestoreClient");

const COLLECTION = "feedbackComments";

export interface FeedbackCommentAttachment {
  url: string;
  publicId: string;
  name: string;
  mimeType: string;
  bytes: number;
}

export interface FeedbackCommentMention {
  userId: string;
  name: string;
}

export interface FeedbackComment {
  id: string;
  feedbackId: string;
  // Flat, one-level threading — null for a root message, otherwise the id of
  // the root message it replies to (see FeedbackCommentService.resolveParentId).
  parentId: string | null;
  authorType: string;
  authorId: string | null;
  authorName: string;
  // Set only when authorType is "staff" — the poster's UserRole at the time
  // (admin/user/superadmin/it_support), so the UI can badge which side of a
  // three-way (submitter / IT support / product team) thread a message is
  // from. Denormalized, same reasoning as authorName (Firestore has no join).
  authorRole: string | null;
  body: string;
  attachments: FeedbackCommentAttachment[];
  // Staff-to-staff only — the submitter has no account and can't be
  // mentioned. Validated against actual staff access to this ticket at write
  // time (see FeedbackCommentService.resolveMentions).
  mentions: FeedbackCommentMention[];
  createdAt: Date | null;
}

function toComment(snap: any): FeedbackComment {
  const data = snap.data() as any;
  return {
    id: snap.id,
    feedbackId: data.feedbackId,
    parentId: data.parentId ?? null,
    authorType: data.authorType,
    authorId: data.authorId ?? null,
    authorName: data.authorName ?? null,
    authorRole: data.authorRole ?? null,
    body: data.body,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    mentions: Array.isArray(data.mentions) ? data.mentions : [],
    createdAt: data.createdAt ? data.createdAt.toDate() : null,
  };
}

// Firestore init/connection failures must not crash the request — surfaced as
// a clear 503 instead (mirrors featureRequestComment.repository.js).
function unavailable(err: Error): AppError {
  console.error("[feedbackComments] Firestore error:", err.message);
  return new AppError("The conversation is temporarily unavailable", 503);
}

export class FeedbackCommentRepository {
  static Instance = new FeedbackCommentRepository();

  // Oldest first — a thread reads top-to-bottom like a conversation. Kept for
  // API completeness (non-web clients); the web app uses a realtime listener.
  async findByFeedback(feedbackId: string): Promise<FeedbackComment[]> {
    try {
      const snap = await getFirestore()
        .collection(COLLECTION)
        .where("feedbackId", "==", feedbackId)
        .orderBy("createdAt", "asc")
        .get();
      return snap.docs.map(toComment);
    } catch (err) {
      throw unavailable(err as Error);
    }
  }

  async findById(id: string): Promise<FeedbackComment | null> {
    try {
      const snap = await getFirestore().collection(COLLECTION).doc(id).get();
      return snap.exists ? toComment(snap) : null;
    } catch (err) {
      throw unavailable(err as Error);
    }
  }

  // data: { feedbackId, parentId?, authorType, authorId, authorName, authorRole?, body, attachments?, mentions? }
  async create(data: {
    feedbackId: string;
    parentId?: string | null;
    authorType: string;
    authorId: string | null;
    authorName: string;
    authorRole?: string | null;
    body: string;
    attachments?: FeedbackCommentAttachment[];
    mentions?: FeedbackCommentMention[];
  }): Promise<FeedbackComment> {
    try {
      const ref = await getFirestore()
        .collection(COLLECTION)
        .add({
          feedbackId: data.feedbackId,
          parentId: data.parentId ?? null,
          authorType: data.authorType,
          authorId: data.authorId ?? null,
          authorName: data.authorName ?? null,
          authorRole: data.authorRole ?? null,
          body: data.body,
          attachments: data.attachments ?? [],
          mentions: data.mentions ?? [],
          createdAt: FieldValue.serverTimestamp(),
        });
      const snap = await ref.get();
      return toComment(snap);
    } catch (err) {
      throw unavailable(err as Error);
    }
  }
}

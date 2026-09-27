// modules/featureRequest/repositories/featureRequestComment.repository.js
// Comments live in Firestore (realtime), not Postgres. Same method signatures as
// every other repository in this codebase — featureRequest.service.js is unaware
// of the swap (Dependency Inversion — see ai_agent_flow_backend.md §18).
const { getFirestore, FieldValue } = require("../../../infrastructure/firestore/firestoreClient");
const { buildMeta } = require("../../../shared/pagination/paginate");
const { AppError } = require("../../../shared/errors/AppError");

const COLLECTION = "featureRequestComments";

function toComment(snap) {
  const data = snap.data();
  return {
    id: snap.id,
    featureRequestId: data.featureRequestId,
    // Flat, one-level threading — null for a root comment, otherwise the id
    // of the root comment it replies to (see FeatureRequestService.addComment).
    parentId: data.parentId ?? null,
    authorId: data.authorId ?? null,
    authorName: data.authorName ?? null,
    body: data.body,
    editedAt: data.editedAt ? data.editedAt.toDate() : null,
    // Sparse map of userId -> "like" | "dislike". Small (bounded by thread
    // participants), so counts are derived from it rather than kept as a
    // separate denormalized counter.
    reactions: data.reactions ?? {},
    // [{ userId, name }] — denormalized (Firestore has no join), validated at
    // write time against project membership (see FeatureRequestService.addComment).
    mentions: data.mentions ?? [],
    createdAt: data.createdAt ? data.createdAt.toDate() : null,
    deletedAt: data.deletedAt ? data.deletedAt.toDate() : null,
  };
}

// Firestore init/connection failures must not crash the request — surfaced as a
// clear 503 instead (mirrors mailer.js's "credentials not set" tolerance).
function unavailable(err) {
  console.error("[featureRequestComments] Firestore error:", err.message);
  return new AppError("Comments are temporarily unavailable", 503);
}

class FeatureRequestCommentRepository {
  static Instance = new FeatureRequestCommentRepository();

  // Kept for API completeness (non-web clients) — the web app uses a realtime
  // onSnapshot listener instead. Always returns the first `limit` comments;
  // deep offset pagination isn't supported since Firestore has no OFFSET.
  async fetchPaginated(featureRequestId, { page = 1, limit = 20 }) {
    try {
      const base = getFirestore()
        .collection(COLLECTION)
        .where("featureRequestId", "==", featureRequestId)
        .where("deletedAt", "==", null);

      const [snap, countSnap] = await Promise.all([
        base.orderBy("createdAt", "asc").limit(limit).get(),
        base.count().get(),
      ]);

      const data = snap.docs.map(toComment);
      const total = countSnap.data().count;
      return { data, meta: buildMeta(page, limit, total, data.length) };
    } catch (err) {
      throw unavailable(err);
    }
  }

  async findById(id) {
    try {
      const snap = await getFirestore().collection(COLLECTION).doc(id).get();
      if (!snap.exists) return null;
      const comment = toComment(snap);
      return comment.deletedAt ? null : comment;
    } catch (err) {
      throw unavailable(err);
    }
  }

  // data: { featureRequestId, parentId?, authorId, authorName, body, mentions? }
  async create(data) {
    try {
      const col = getFirestore().collection(COLLECTION);
      const ref = await col.add({
        featureRequestId: data.featureRequestId,
        parentId: data.parentId ?? null,
        authorId: data.authorId ?? null,
        authorName: data.authorName ?? null,
        body: data.body,
        editedAt: null,
        reactions: {},
        mentions: data.mentions ?? [],
        createdAt: FieldValue.serverTimestamp(),
        deletedAt: null,
      });
      const snap = await ref.get();
      return toComment(snap);
    } catch (err) {
      throw unavailable(err);
    }
  }

  async softDelete(id) {
    try {
      await getFirestore().collection(COLLECTION).doc(id).update({
        deletedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      throw unavailable(err);
    }
  }

  // Deleting a root comment would otherwise orphan its replies from view — the
  // realtime query filters out deletedAt comments entirely, so a deleted root
  // simply vanishes along with anything threaded under it.
  async hasReplies(id) {
    try {
      const snap = await getFirestore()
        .collection(COLLECTION)
        .where("parentId", "==", id)
        .where("deletedAt", "==", null)
        .limit(1)
        .get();
      return !snap.empty;
    } catch (err) {
      throw unavailable(err);
    }
  }

  async updateBody(id, body) {
    try {
      await getFirestore().collection(COLLECTION).doc(id).update({
        body,
        editedAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      throw unavailable(err);
    }
  }

  // reaction: "like" | "dislike" | null (null clears the caller's reaction).
  async setReaction(id, userId, reaction) {
    try {
      const field = `reactions.${userId}`;
      await getFirestore()
        .collection(COLLECTION)
        .doc(id)
        .update({ [field]: reaction === null ? FieldValue.delete() : reaction });
    } catch (err) {
      throw unavailable(err);
    }
  }
}

module.exports = { FeatureRequestCommentRepository };

// modules/featureRequest/dto/featureRequest.dto.js
const { formatReferenceCode } = require("../../../shared/utils/referenceCode");

function toFeatureRequestResponse(fr, extra = {}) {
  if (!fr) return null;
  const submitter = fr.submittedBy;
  return {
    id: fr.id,
    referenceCode: formatReferenceCode("FR", fr.requestNumber, fr.createdAt),
    projectId: fr.projectId,
    title: fr.title,
    description: fr.description,
    status: fr.status,
    category: fr.category ?? null,
    module: fr.module ?? null,
    referenceLinks: fr.referenceLinks ?? [],
    submittedBy: submitter
      ? {
          id: submitter.id,
          name: [submitter.firstName, submitter.lastName].filter(Boolean).join(" "),
        }
      : null,
    assignedTo: fr.assignedTo
      ? {
          id: fr.assignedTo.id,
          name: [fr.assignedTo.firstName, fr.assignedTo.lastName].filter(Boolean).join(" "),
        }
      : null,
    upvoteCount: fr.upvoteCount ?? 0,
    hasVoted: extra.hasVoted ?? false,
    commentCount: extra.commentCount ?? 0,
    adminResponse: fr.adminResponse ?? null,
    statusUpdatedAt: fr.statusUpdatedAt ?? null,
    createdAt: fr.createdAt,
  };
}

// Firestore has no join — authorId/authorName are denormalized directly onto the doc.
// actorId picks the viewer's own reaction (if any) out of the sparse reactions map.
function toCommentResponse(c, actorId) {
  if (!c) return null;
  const reactions = c.reactions || {};
  let likeCount = 0;
  let dislikeCount = 0;
  let myReaction = null;
  for (const [userId, r] of Object.entries(reactions)) {
    if (r === "like") likeCount++;
    else if (r === "dislike") dislikeCount++;
    if (userId === actorId) myReaction = r;
  }
  return {
    id: c.id,
    featureRequestId: c.featureRequestId,
    parentId: c.parentId ?? null,
    author: c.authorId ? { id: c.authorId, name: c.authorName || "Deleted user" } : null,
    body: c.body,
    editedAt: c.editedAt ?? null,
    reactions: { likeCount, dislikeCount, myReaction },
    mentions: (c.mentions ?? []).map((m) => ({ id: m.userId, name: m.name })),
    createdAt: c.createdAt,
  };
}

// Ordered oldest → newest. The client derives time-in-status from consecutive
// `enteredAt` timestamps (the last entry's is still running).
function toStatusTimelineResponse(rows) {
  return rows.map((r) => ({ status: r.status, enteredAt: r.enteredAt }));
}

module.exports = { toFeatureRequestResponse, toCommentResponse, toStatusTimelineResponse };

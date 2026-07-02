// modules/featureRequest/dto/featureRequest.dto.js

function toFeatureRequestResponse(fr, extra = {}) {
  if (!fr) return null;
  const submitter = fr.submittedBy;
  return {
    id: fr.id,
    projectId: fr.projectId,
    title: fr.title,
    description: fr.description,
    status: fr.status,
    category: fr.category ?? null,
    submittedBy: submitter
      ? {
          id: submitter.id,
          name: [submitter.firstName, submitter.lastName].filter(Boolean).join(" "),
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
function toCommentResponse(c) {
  if (!c) return null;
  return {
    id: c.id,
    featureRequestId: c.featureRequestId,
    author: c.authorId ? { id: c.authorId, name: c.authorName || "Deleted user" } : null,
    body: c.body,
    createdAt: c.createdAt,
  };
}

module.exports = { toFeatureRequestResponse, toCommentResponse };

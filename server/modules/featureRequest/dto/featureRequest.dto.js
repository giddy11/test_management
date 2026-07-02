// modules/featureRequest/dto/featureRequest.dto.js

function toFeatureRequestResponse(fr, extra = {}) {
  if (!fr) return null;
  const submitter = fr.submittedBy;
  return {
    id: fr.id,
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

function toCommentResponse(c) {
  if (!c) return null;
  const author = c.author;
  return {
    id: c.id,
    featureRequestId: c.featureRequestId,
    author: author
      ? { id: author.id, name: [author.firstName, author.lastName].filter(Boolean).join(" ") }
      : null,
    body: c.body,
    createdAt: c.createdAt,
  };
}

module.exports = { toFeatureRequestResponse, toCommentResponse };

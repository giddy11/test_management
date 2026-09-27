// modules/bug/dto/bug.dto.js
const { formatReferenceCode } = require("../../../shared/utils/referenceCode");

function userSummary(user) {
  if (!user) return null;
  return { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(" ") };
}

function toBugResponse(bug) {
  if (!bug) return null;
  return {
    id: bug.id,
    referenceCode: formatReferenceCode("BF", bug.bugNumber, bug.createdAt),
    projectId: bug.projectId,
    title: bug.title,
    description: bug.description,
    stepsToReproduce: bug.stepsToReproduce ?? [],
    expectedBehavior: bug.expectedBehavior ?? null,
    actualBehavior: bug.actualBehavior ?? null,
    environment: bug.environment ?? null,
    severity: bug.severity,
    priority: bug.priority,
    status: bug.status,
    testCaseId: bug.testCaseId ?? null,
    testRunId: bug.testRunId ?? null,
    reportedBy: userSummary(bug.reportedBy),
    assignedTo: userSummary(bug.assignedTo),
    resolvedAt: bug.resolvedAt ?? null,
    closedAt: bug.closedAt ?? null,
    statusUpdatedAt: bug.statusUpdatedAt ?? null,
    commentCount: bug.commentCount ?? 0,
    createdAt: bug.createdAt,
  };
}

// Ordered oldest → newest. The client derives time-in-status from consecutive
// `enteredAt` timestamps (the last entry's is still running).
function toBugTimelineResponse(rows) {
  return rows.map((r) => ({ status: r.status, enteredAt: r.enteredAt }));
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
    bugId: c.bugId,
    parentId: c.parentId ?? null,
    author: c.authorId ? { id: c.authorId, name: c.authorName || "Deleted user" } : null,
    body: c.body,
    editedAt: c.editedAt ?? null,
    reactions: { likeCount, dislikeCount, myReaction },
    mentions: (c.mentions ?? []).map((m) => ({ id: m.userId, name: m.name })),
    createdAt: c.createdAt,
  };
}

module.exports = { toBugResponse, toBugTimelineResponse, toCommentResponse };

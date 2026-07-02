// modules/bug/dto/bug.dto.js

function userSummary(user) {
  if (!user) return null;
  return { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(" ") };
}

function toBugResponse(bug) {
  if (!bug) return null;
  return {
    id: bug.id,
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
    createdAt: bug.createdAt,
  };
}

module.exports = { toBugResponse };

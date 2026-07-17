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
    referenceCode: formatReferenceCode("BF", bug.bugNumber),
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

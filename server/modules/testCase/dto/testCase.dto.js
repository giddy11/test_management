// modules/testCase/dto/testCase.dto.js

function toTestCaseResponse(tc) {
  if (!tc) return null;
  return {
    id: tc.id,
    title: tc.title,
    description: tc.description ?? null,
    steps: tc.steps ?? [],
    expectedResult: tc.expectedResult,
    priority: tc.priority,
    status: tc.status,
    suiteId: tc.suiteId,
    assignedToId: tc.assignedToId ?? null,
    tags: tc.tags ?? [],
    createdAt: tc.createdAt,
  };
}

module.exports = { toTestCaseResponse };

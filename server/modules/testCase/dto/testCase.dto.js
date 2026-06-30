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
    assignees: Array.isArray(tc.assignees)
      ? tc.assignees.map((u) => ({
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" "),
          email: u.email,
        }))
      : [],
    tags: tc.tags ?? [],
    deadline: tc.deadline ?? null,
    attachmentCount: tc.attachmentCount ?? 0,
    createdAt: tc.createdAt,
  };
}

module.exports = { toTestCaseResponse };

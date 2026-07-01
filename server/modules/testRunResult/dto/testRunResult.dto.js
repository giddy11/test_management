// modules/testRunResult/dto/testRunResult.dto.js

function toResultResponse(result) {
  if (!result) return null;
  return {
    id: result.id,
    runId: result.runId,
    testCaseId: result.testCaseId,
    caseTitle: result.testCase?.title ?? null,
    caseDescription: result.testCase?.description ?? null,
    casePriority: result.testCase?.priority ?? null,
    caseSteps: result.testCase?.steps ?? null,
    caseExpectedResult: result.testCase?.expectedResult ?? null,
    caseTags: result.testCase?.tags ?? null,
    status: result.status ?? null,
    actualResult: result.actualResult ?? null,
    notes: result.notes ?? null,
    executedById: result.executedById ?? null,
    executedAt: result.executedAt ?? null,
  };
}

module.exports = { toResultResponse };

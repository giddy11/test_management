// modules/testRunResult/dto/testRunResult.dto.js

function toResultResponse(result) {
  if (!result) return null;
  return {
    id: result.id,
    runId: result.runId,
    testCaseId: result.testCaseId,
    status: result.status ?? null,
    actualResult: result.actualResult ?? null,
    notes: result.notes ?? null,
    executedById: result.executedById ?? null,
    executedAt: result.executedAt ?? null,
  };
}

module.exports = { toResultResponse };

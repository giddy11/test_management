// modules/testRun/dto/testRun.dto.js

function toTestRunResponse(run, summary) {
  if (!run) return null;
  return {
    id: run.id,
    name: run.name,
    projectId: run.projectId,
    suiteId: run.suiteId,
    status: run.status,
    createdById: run.createdById,
    createdAt: run.createdAt,
    ...(summary ? { summary } : {}),
  };
}

module.exports = { toTestRunResponse };

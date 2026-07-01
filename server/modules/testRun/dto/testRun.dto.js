// modules/testRun/dto/testRun.dto.js

function toTestRunResponse(run, summary) {
  if (!run) return null;
  const cb = run.createdBy;
  const createdByName = cb
    ? [cb.firstName, cb.lastName].filter(Boolean).join(" ")
    : null;
  return {
    id: run.id,
    name: run.name,
    projectId: run.projectId,
    suiteId: run.suiteId,
    status: run.status,
    createdById: run.createdById,
    createdByName: createdByName ?? null,
    testers: run.testers ?? [],
    createdAt: run.createdAt,
    ...(summary ? { summary } : {}),
  };
}

module.exports = { toTestRunResponse };

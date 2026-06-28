// modules/testSuite/dto/testSuite.dto.js

function toTestSuiteResponse(suite) {
  if (!suite) return null;
  return {
    id: suite.id,
    name: suite.name,
    description: suite.description ?? null,
    projectId: suite.projectId,
    createdAt: suite.createdAt,
  };
}

module.exports = { toTestSuiteResponse };

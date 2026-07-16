// modules/feedback/middleware/apiKeyAuth.middleware.ts
// Authenticates a partner's server-to-server integration call via the
// x-api-key header, resolving it to the owning project. Async (a DB lookup,
// unlike auth.middleware.js's synchronous JWT check) so it follows this
// codebase's controller convention of throwing AppError + next(err).
export {}; // marks this file as an ES module so its declarations aren't global

const { ProjectRepository } = require("../../project/repositories/project.repository");
const { hashToken } = require("../../../shared/utils/password");
const { AppError } = require("../../../shared/errors/AppError");

async function apiKeyAuth(req: any, res: any, next: any) {
  try {
    const key = req.headers["x-api-key"];
    if (!key || typeof key !== "string") {
      throw AppError.unauthorised("Missing x-api-key header");
    }
    const project = await ProjectRepository.Instance.findByIntegrationApiKeyHash(hashToken(key));
    if (!project || project.deletedAt) {
      throw AppError.unauthorised("Invalid API key");
    }
    req.integrationProject = project;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { apiKeyAuth };

// modules/feedback/middleware/apiKeyAuth.middleware.ts
// Authenticates a partner's server-to-server integration call via the
// x-api-key header, resolving it to the owning client company — tickets
// created with this key land in that company's IT support queue, same as a
// submission through their public form. Async (a DB lookup, unlike
// auth.middleware.js's synchronous JWT check) so it follows this codebase's
// controller convention of throwing AppError + next(err).
export {}; // marks this file as an ES module so its declarations aren't global

const { ClientCompanyRepository } = require("../../clientCompany/repositories/clientCompany.repository");
const { hashToken } = require("../../../shared/utils/password");
const { AppError } = require("../../../shared/errors/AppError");

async function apiKeyAuth(req: any, res: any, next: any) {
  try {
    const key = req.headers["x-api-key"];
    if (!key || typeof key !== "string") {
      throw AppError.unauthorised("Missing x-api-key header");
    }
    const company = await ClientCompanyRepository.Instance.findByIntegrationApiKeyHash(hashToken(key));
    if (!company || company.deletedAt) {
      throw AppError.unauthorised("Invalid API key");
    }
    req.integrationClientCompany = company;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { apiKeyAuth };

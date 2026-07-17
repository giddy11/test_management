// modules/feedback/tests/apiKeyAuth.middleware.spec.ts
// Authenticates the partner integration API's x-api-key header, resolving it
// to the owning client company (tickets land in that company's IT queue).
export {}; // marks this file as an ES module so its declarations aren't global

jest.mock("../../clientCompany/repositories/clientCompany.repository", () => ({
  ClientCompanyRepository: { Instance: { findByIntegrationApiKeyHash: jest.fn() } },
}));

const { apiKeyAuth } = require("../middleware/apiKeyAuth.middleware");
const { ClientCompanyRepository } = require("../../clientCompany/repositories/clientCompany.repository");

function makeReq(headers: Record<string, string> = {}) {
  return { headers };
}

describe("apiKeyAuth middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects a request with no x-api-key header", async () => {
    const req = makeReq();
    const next = jest.fn();

    await apiKeyAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(ClientCompanyRepository.Instance.findByIntegrationApiKeyHash).not.toHaveBeenCalled();
  });

  it("rejects an unknown key", async () => {
    ClientCompanyRepository.Instance.findByIntegrationApiKeyHash.mockResolvedValue(null);
    const req = makeReq({ "x-api-key": "tmk_bad" });
    const next = jest.fn();

    await apiKeyAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("rejects a key belonging to a soft-deleted client company", async () => {
    ClientCompanyRepository.Instance.findByIntegrationApiKeyHash.mockResolvedValue({
      id: "company-1",
      deletedAt: new Date(),
    });
    const req = makeReq({ "x-api-key": "tmk_deleted" });
    const next = jest.fn();

    await apiKeyAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("attaches the resolved client company and calls next() with no error on a valid key", async () => {
    const company = { id: "company-1", projectId: "proj-1", name: "DOMS", deletedAt: null };
    ClientCompanyRepository.Instance.findByIntegrationApiKeyHash.mockResolvedValue(company);
    const req: any = makeReq({ "x-api-key": "tmk_good" });
    const next = jest.fn();

    await apiKeyAuth(req, {}, next);

    expect(req.integrationClientCompany).toBe(company);
    expect(next).toHaveBeenCalledWith();
  });
});

// modules/feedback/tests/apiKeyAuth.middleware.spec.ts
// Authenticates the partner integration API's x-api-key header.
export {}; // marks this file as an ES module so its declarations aren't global

jest.mock("../../project/repositories/project.repository", () => ({
  ProjectRepository: { Instance: { findByIntegrationApiKeyHash: jest.fn() } },
}));

const { apiKeyAuth } = require("../middleware/apiKeyAuth.middleware");
const { ProjectRepository } = require("../../project/repositories/project.repository");

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
    expect(ProjectRepository.Instance.findByIntegrationApiKeyHash).not.toHaveBeenCalled();
  });

  it("rejects an unknown key", async () => {
    ProjectRepository.Instance.findByIntegrationApiKeyHash.mockResolvedValue(null);
    const req = makeReq({ "x-api-key": "tmk_bad" });
    const next = jest.fn();

    await apiKeyAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("rejects a key belonging to a soft-deleted project", async () => {
    ProjectRepository.Instance.findByIntegrationApiKeyHash.mockResolvedValue({
      id: "proj-1",
      deletedAt: new Date(),
    });
    const req = makeReq({ "x-api-key": "tmk_deleted" });
    const next = jest.fn();

    await apiKeyAuth(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("attaches the resolved project and calls next() with no error on a valid key", async () => {
    const project = { id: "proj-1", name: "Product A", deletedAt: null };
    ProjectRepository.Instance.findByIntegrationApiKeyHash.mockResolvedValue(project);
    const req: any = makeReq({ "x-api-key": "tmk_good" });
    const next = jest.fn();

    await apiKeyAuth(req, {}, next);

    expect(req.integrationProject).toBe(project);
    expect(next).toHaveBeenCalledWith();
  });
});

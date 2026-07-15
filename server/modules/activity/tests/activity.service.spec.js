// modules/activity/tests/activity.service.spec.js
const { ActivityService } = require("../services/activity.service");
const { UserRole } = require("../../../config/constants");

function makeRepo() {
  return {
    create: jest.fn().mockResolvedValue({}),
    fetchPaginated: jest.fn().mockResolvedValue({ data: [], meta: {} }),
  };
}

describe("ActivityService", () => {
  let repo;
  let service;

  beforeEach(() => {
    repo = makeRepo();
    service = new ActivityService(repo);
  });

  describe("log", () => {
    it("stores clientCompanyId alongside the usual fields", () => {
      service.log(
        { id: "sup-1", organizationId: "org-1" },
        {
          action: "feedback.escalated",
          summary: "IT support escalated it",
          entityType: "feedback",
          entityId: "fb-1",
          clientCompanyId: "cc-1",
        }
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientCompanyId: "cc-1", organizationId: "org-1" })
      );
    });
  });

  describe("fetch", () => {
    it("scopes admins by organizationId", async () => {
      await service.fetch({ role: UserRole.ADMIN, organizationId: "org-1" }, { page: 1 });
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" })
      );
    });

    it("leaves superadmins unscoped", async () => {
      await service.fetch({ role: UserRole.SUPERADMIN, organizationId: "org-1" }, { page: 1 });
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: undefined })
      );
    });

    it("scopes IT support by their own client company, not organizationId", async () => {
      await service.fetch(
        { role: UserRole.IT_SUPPORT, organizationId: "org-1", clientCompanyId: "cc-1" },
        { page: 1 }
      );
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: undefined, clientCompanyId: "cc-1" })
      );
    });

    it("never falls through to an unscoped query for an IT support actor with no company", async () => {
      const result = await service.fetch(
        { role: UserRole.IT_SUPPORT, organizationId: "org-1", clientCompanyId: null },
        { page: 1 }
      );
      expect(repo.fetchPaginated).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
    });
  });
});

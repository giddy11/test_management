// modules/activity/tests/activity.service.spec.js
const { ActivityService } = require("../services/activity.service");
const { actorFor } = require("../../../test/actors");
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
      await service.fetch(actorFor("admin"), { page: 1 });
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" })
      );
    });

    it("scopes a superadmin to their own organisation too", async () => {
      await service.fetch(actorFor("superadmin"), { page: 1 });
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" })
      );
    });

    it("scopes IT support by their own client company, not organizationId", async () => {
      await service.fetch(
        actorFor("it_support", { clientCompanyId: "cc-1" }),
        { page: 1 }
      );
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: undefined, clientCompanyId: "cc-1" })
      );
    });

    it("never falls through to an unscoped query for an IT support actor with no company", async () => {
      // A supporter account whose clientCompanyId is missing must get nothing,
      // not the whole organisation log. Their role grants audit.read but not
      // organisation-wide visibility, so the scoping layer denies.
      const result = await service.fetch(
        actorFor("it_support", { clientCompanyId: null }),
        { page: 1 }
      );
      expect(repo.fetchPaginated).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
    });
  });
});

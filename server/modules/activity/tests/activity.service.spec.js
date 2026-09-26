// modules/activity/tests/activity.service.spec.js
const { ActivityService } = require("../services/activity.service");
const { actorFor } = require("../../../test/actors");

function makeRepo() {
  return {
    create: jest.fn().mockResolvedValue({}),
    fetchPaginated: jest.fn().mockResolvedValue({ data: [], meta: {} }),
    fetchForExport: jest.fn().mockResolvedValue([]),
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

    it("denormalises the actor's name and role onto the row", () => {
      service.log(
        {
          id: "u-1",
          organizationId: "org-1",
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          role: "admin",
        },
        { action: "project.created", summary: "Created project" }
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorName: "Ada Lovelace", actorRole: "admin" })
      );
    });

    it("falls back to the email when the token carries no name", () => {
      service.log(
        { id: "u-1", organizationId: "org-1", email: "ada@example.com", role: "admin" },
        { action: "project.created", summary: "Created project" }
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorName: "ada@example.com" })
      );
    });

    it("derives severity from the action", () => {
      service.log({ id: "u-1" }, { action: "role.assigned", summary: "x" });
      service.log({ id: "u-1" }, { action: "suite.created", summary: "y" });
      expect(repo.create.mock.calls[0][0].severity).toBe("critical");
      expect(repo.create.mock.calls[1][0].severity).toBe("info");
    });

    it("lets a call site override the derived severity", () => {
      service.log(
        { id: "u-1" },
        { action: "suite.created", summary: "y", severity: "warning" }
      );
      expect(repo.create.mock.calls[0][0].severity).toBe("warning");
    });

    it("never lets a logging failure reach the caller", () => {
      repo.create.mockRejectedValueOnce(new Error("db down"));
      expect(() =>
        service.log({ id: "u-1" }, { action: "project.created", summary: "x" })
      ).not.toThrow();
    });
  });

  describe("buildEntry", () => {
    // The transactional callers (AccessService.setUserRoles) build the row here
    // and insert it themselves, so it has to be complete without touching the DB.
    it("returns a complete row without writing anything", () => {
      const entry = service.buildEntry(
        { id: "u-1", organizationId: "org-1", role: "admin", name: "Ada" },
        { action: "role.assigned", summary: "Changed roles", entityId: "t-1" }
      );
      expect(repo.create).not.toHaveBeenCalled();
      expect(entry).toMatchObject({
        organizationId: "org-1",
        actorId: "u-1",
        actorName: "Ada",
        actorRole: "admin",
        action: "role.assigned",
        severity: "critical",
      });
    });
  });

  describe("append-only", () => {
    // The guarantee is enforced by a database trigger; this is the app-side half
    // of it — nothing in the module offers a way to reach an UPDATE or a DELETE.
    it("exposes no update or delete path", () => {
      for (const name of ["update", "delete", "remove", "purge", "clear"]) {
        expect(service[name]).toBeUndefined();
      }
      const { ActivityRepository } = require("../repositories/activity.repository");
      for (const name of ["update", "delete", "remove", "save"]) {
        expect(ActivityRepository.prototype[name]).toBeUndefined();
      }
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

    it("passes the search and severity filters through to the query", async () => {
      await service.fetch(actorFor("admin"), {
        page: 1,
        search: "ada",
        severity: "critical",
      });
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ search: "ada", severity: "critical" })
      );
    });
  });

  describe("fetchForExport", () => {
    it("applies the same scope as the on-screen list", async () => {
      await service.fetchForExport(
        actorFor("it_support", { clientCompanyId: "cc-1" }),
        { severity: "warning" }
      );
      expect(repo.fetchForExport).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: undefined,
          clientCompanyId: "cc-1",
          severity: "warning",
        })
      );
    });

    it("exports nothing for an actor the list would deny", async () => {
      const rows = await service.fetchForExport(
        actorFor("it_support", { clientCompanyId: null }),
        {}
      );
      expect(repo.fetchForExport).not.toHaveBeenCalled();
      expect(rows).toEqual([]);
    });
  });
});

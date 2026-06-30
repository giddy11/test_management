// modules/project/tests/project.service.spec.js
const { ProjectService } = require("../services/project.service");

function makeProjectRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
  };
}

function makeAuthRepo() {
  return { findUserById: jest.fn() };
}

// actor = authenticated user; project belongs to the same organisation.
const actor = { id: "owner-1", role: "admin", organizationId: "org-1" };
const project = {
  id: "proj-1",
  name: "Checkout",
  ownerId: "owner-1",
  organizationId: "org-1",
  deletedAt: null,
};

describe("ProjectService", () => {
  let projectRepo;
  let authRepo;
  let service;

  beforeEach(() => {
    projectRepo = makeProjectRepo();
    authRepo = makeAuthRepo();
    service = new ProjectService(projectRepo, authRepo);
  });

  describe("fetchProjects", () => {
    it("scopes the query to the actor's organisation", async () => {
      projectRepo.fetchPaginated.mockResolvedValue({ data: [project], meta: {} });
      const result = await service.fetchProjects(actor, { page: 1, limit: 20 });
      expect(projectRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1", page: 1, limit: 20 })
      );
      expect(result.data).toHaveLength(1);
    });

    it("does not scope a superadmin", async () => {
      projectRepo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchProjects({ id: "s", role: "superadmin" }, { page: 1, limit: 20 });
      expect(projectRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: undefined })
      );
    });
  });

  describe("getProject", () => {
    it("returns the project for a member of its organisation", async () => {
      projectRepo.findById.mockResolvedValue(project);
      await expect(service.getProject(actor, "proj-1")).resolves.toBe(project);
    });

    it("throws 404 when missing or soft-deleted", async () => {
      projectRepo.findById.mockResolvedValue(null);
      await expect(service.getProject(actor, "proj-1")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("throws 403 for a caller in a different organisation", async () => {
      projectRepo.findById.mockResolvedValue(project);
      await expect(
        service.getProject({ id: "x", role: "admin", organizationId: "org-2" }, "proj-1")
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("createProject", () => {
    it("creates with the actor's id and organisation", async () => {
      projectRepo.create.mockImplementation(async (d) => ({ id: "proj-2", ...d }));
      const created = await service.createProject(actor, { name: "New", description: "d" });
      expect(projectRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New",
          ownerId: "owner-1",
          organizationId: "org-1",
          description: "d",
        })
      );
      expect(created.id).toBe("proj-2");
    });

    it("resolves member ids and throws 404 for an unknown member", async () => {
      authRepo.findUserById.mockResolvedValue(null);
      await expect(
        service.createProject(actor, { name: "x", memberIds: ["missing"] })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("attaches resolved members when valid", async () => {
      authRepo.findUserById.mockResolvedValue({ id: "m-1" });
      projectRepo.create.mockImplementation(async (d) => d);
      const created = await service.createProject(actor, { name: "x", memberIds: ["m-1"] });
      expect(created.members).toEqual([{ id: "m-1" }]);
    });
  });

  describe("updateProject", () => {
    it("patches provided fields and saves", async () => {
      projectRepo.findById.mockResolvedValue({ ...project });
      projectRepo.save.mockImplementation(async (e) => e);
      const updated = await service.updateProject(actor, "proj-1", { name: "Renamed" });
      expect(updated.name).toBe("Renamed");
      expect(projectRepo.save).toHaveBeenCalled();
    });
  });

  describe("deleteProject", () => {
    it("soft-deletes after the access check", async () => {
      projectRepo.findById.mockResolvedValue(project);
      await service.deleteProject(actor, "proj-1");
      expect(projectRepo.softDelete).toHaveBeenCalledWith("proj-1");
    });
  });
});

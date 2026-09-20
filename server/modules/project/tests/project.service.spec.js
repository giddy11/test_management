// modules/project/tests/project.service.spec.js
const { ProjectService } = require("../services/project.service");
const { permissionsFor } = require("../../../test/actors");

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

function makeTestCaseRepo() {
  return { hasAssignmentInProject: jest.fn().mockResolvedValue(true) };
}

function makeMemberRepo() {
  return {
    getRole: jest.fn().mockResolvedValue(null),
    setMembers: jest.fn().mockResolvedValue(undefined),
    findByProject: jest.fn().mockResolvedValue([]),
    findMemberUsers: jest.fn().mockResolvedValue([]),
  };
}

function makeNotificationService() {
  return { notifyProjectMemberAdded: jest.fn().mockResolvedValue(undefined) };
}

// actor = authenticated user; project belongs to the same organisation.
const actor = { id: "owner-1", role: "admin", permissions: permissionsFor("admin"), organizationId: "org-1" };
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
  let testCaseRepo;
  let memberRepo;
  let notificationService;
  let service;

  beforeEach(() => {
    projectRepo = makeProjectRepo();
    authRepo = makeAuthRepo();
    testCaseRepo = makeTestCaseRepo();
    memberRepo = makeMemberRepo();
    notificationService = makeNotificationService();
    service = new ProjectService(
      projectRepo,
      authRepo,
      testCaseRepo,
      memberRepo,
      notificationService
    );
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
      await service.fetchProjects({ id: "s", role: "superadmin", permissions: permissionsFor("superadmin") }, { page: 1, limit: 20 });
      expect(projectRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: undefined })
      );
    });

    it("additionally scopes a plain 'user' by membership/assignment", async () => {
      projectRepo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      const plainUser = { id: "u-1", role: "user", permissions: permissionsFor("user"), organizationId: "org-1" };
      await service.fetchProjects(plainUser, { page: 1, limit: 20 });
      expect(projectRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1", restrictedUserId: "u-1" })
      );
    });

    it("does not restrict an admin", async () => {
      projectRepo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchProjects(actor, { page: 1, limit: 20 });
      expect(projectRepo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ restrictedUserId: undefined })
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
        service.getProject({ id: "x", role: "admin", permissions: permissionsFor("admin"), organizationId: "org-2" }, "proj-1")
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("throws 403 for a 'user' who is neither a member nor assigned in the project", async () => {
      projectRepo.findById.mockResolvedValue(project);
      memberRepo.getRole.mockResolvedValue(null);
      testCaseRepo.hasAssignmentInProject.mockResolvedValue(false);
      const plainUser = { id: "u-1", role: "user", permissions: permissionsFor("user"), organizationId: "org-1" };
      await expect(service.getProject(plainUser, "proj-1")).rejects.toMatchObject({ statusCode: 403 });
      expect(testCaseRepo.hasAssignmentInProject).toHaveBeenCalledWith("proj-1", "u-1");
    });

    it("allows a 'user' who is assigned to at least one case in the project", async () => {
      projectRepo.findById.mockResolvedValue(project);
      memberRepo.getRole.mockResolvedValue(null);
      testCaseRepo.hasAssignmentInProject.mockResolvedValue(true);
      const plainUser = { id: "u-1", role: "user", permissions: permissionsFor("user"), organizationId: "org-1" };
      await expect(service.getProject(plainUser, "proj-1")).resolves.toBe(project);
    });

    it("allows a 'user' who is a project member, without any assignment", async () => {
      projectRepo.findById.mockResolvedValue(project);
      memberRepo.getRole.mockResolvedValue("member");
      const plainUser = { id: "u-1", role: "user", permissions: permissionsFor("user"), organizationId: "org-1" };
      await expect(service.getProject(plainUser, "proj-1")).resolves.toBe(project);
      expect(testCaseRepo.hasAssignmentInProject).not.toHaveBeenCalled();
    });

    it("does not check assignment for admins/superadmins", async () => {
      projectRepo.findById.mockResolvedValue(project);
      await service.getProject(actor, "proj-1");
      expect(testCaseRepo.hasAssignmentInProject).not.toHaveBeenCalled();
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

    it("resolves members and throws 404 for an unknown member", async () => {
      authRepo.findUserById.mockResolvedValue(null);
      await expect(
        service.createProject(actor, {
          name: "x",
          members: [{ userId: "missing", role: "member" }],
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("rejects members from another organisation", async () => {
      authRepo.findUserById.mockResolvedValue({ id: "m-1", organizationId: "org-2" });
      await expect(
        service.createProject(actor, {
          name: "x",
          members: [{ userId: "m-1", role: "member" }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("saves members with their project role and notifies them", async () => {
      authRepo.findUserById.mockImplementation(async (id) => ({
        id,
        organizationId: "org-1",
        email: `${id}@x.dev`,
        firstName: id,
        lastName: null,
      }));
      projectRepo.create.mockImplementation(async (d) => ({ id: "proj-2", ...d }));
      await service.createProject(actor, {
        name: "x",
        members: [
          { userId: "m-1", role: "team_lead" },
          { userId: "m-2", role: "member" },
        ],
      });
      expect(memberRepo.setMembers).toHaveBeenCalledWith("proj-2", [
        { userId: "m-1", role: "team_lead" },
        { userId: "m-2", role: "member" },
      ]);
      // fire-and-forget notification — flush microtasks before asserting
      await new Promise((r) => setImmediate(r));
      expect(notificationService.notifyProjectMemberAdded).toHaveBeenCalled();
    });
  });

  describe("isTeamLead", () => {
    it("is true only when the membership row says team_lead", async () => {
      const plainUser = { id: "u-1", role: "user", permissions: permissionsFor("user"), organizationId: "org-1" };
      memberRepo.getRole.mockResolvedValue("team_lead");
      await expect(service.isTeamLead(plainUser, "proj-1")).resolves.toBe(true);
      memberRepo.getRole.mockResolvedValue("member");
      await expect(service.isTeamLead(plainUser, "proj-1")).resolves.toBe(false);
    });

    it("is false for admins — they are unrestricted anyway", async () => {
      await expect(service.isTeamLead(actor, "proj-1")).resolves.toBe(false);
      expect(memberRepo.getRole).not.toHaveBeenCalled();
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

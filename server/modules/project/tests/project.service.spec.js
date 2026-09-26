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

    it("reads membership only — org-wide read visibility does not hide a real lead", async () => {
      // It used to short-circuit to false for anyone who could see every
      // project, so a Viewer-style role that was ALSO a project's lead could
      // not manage it. Membership is the only thing that makes someone a lead.
      const orgWideReader = {
        id: "u-2",
        organizationId: "org-1",
        permissions: new Set(["project.read", "project.readall"]),
      };
      memberRepo.getRole.mockResolvedValue("team_lead");
      await expect(service.isTeamLead(orgWideReader, "proj-1")).resolves.toBe(true);
    });

    it("is false for an admin who is not on the project — their authority is manageall", async () => {
      memberRepo.getRole.mockResolvedValue(null);
      await expect(service.isTeamLead(actor, "proj-1")).resolves.toBe(false);
      // ...but they can still manage it, which is a different question.
      await expect(service.canManageProject(actor, "proj-1")).resolves.toBe(true);
    });
  });

  // The role a person holds IN one project is what decides what they may do
  // there. Platform roles say only whether projects are usable at all.
  describe("getProjectRole", () => {
    const projectLevel = (permissions) => ({
      id: "u-9",
      organizationId: "org-1",
      permissions: new Set(permissions),
    });
    const member = projectLevel(["project.read"]);
    const viewer = projectLevel(["project.read", "project.readall"]);

    beforeEach(() => {
      memberRepo.getRole.mockResolvedValue(null);
      testCaseRepo.hasAssignmentInProject.mockResolvedValue(false);
    });

    it("is lead for the project's team lead", async () => {
      memberRepo.getRole.mockResolvedValue("team_lead");
      await expect(service.getProjectRole(member, "proj-1")).resolves.toBe("lead");
    });

    it("is member for an ordinary project member", async () => {
      memberRepo.getRole.mockResolvedValue("member");
      await expect(service.getProjectRole(member, "proj-1")).resolves.toBe("member");
    });

    it("is member for someone only assigned a case there (legacy access, kept)", async () => {
      testCaseRepo.hasAssignmentInProject.mockResolvedValue(true);
      await expect(service.getProjectRole(member, "proj-1")).resolves.toBe("member");
    });

    it("is lead everywhere for a project.manageall holder, member or not", async () => {
      const admin = projectLevel(["project.read", "project.readall", "project.manageall"]);
      await expect(service.getProjectRole(admin, "proj-1")).resolves.toBe("lead");
      // ...even when their own membership row says plain member.
      memberRepo.getRole.mockResolvedValue("member");
      await expect(service.getProjectRole(admin, "proj-1")).resolves.toBe("lead");
    });

    it("is viewer for org-wide read without being on the project", async () => {
      await expect(service.getProjectRole(viewer, "proj-1")).resolves.toBe("viewer");
    });

    it("lets an org-wide reader who IS on the project take part in it", async () => {
      memberRepo.getRole.mockResolvedValue("member");
      await expect(service.getProjectRole(viewer, "proj-1")).resolves.toBe("member");
    });

    it("is null for someone with no route into the project at all", async () => {
      await expect(service.getProjectRole(member, "proj-1")).resolves.toBeNull();
    });
  });

  describe("assertCanContribute", () => {
    const viewer = {
      id: "u-9",
      organizationId: "org-1",
      permissions: new Set(["project.read", "project.readall"]),
    };
    const member = { id: "u-8", organizationId: "org-1", permissions: new Set(["project.read"]) };

    beforeEach(() => {
      memberRepo.getRole.mockResolvedValue(null);
      testCaseRepo.hasAssignmentInProject.mockResolvedValue(false);
    });

    it("admits a project member", async () => {
      memberRepo.getRole.mockResolvedValue("member");
      await expect(service.assertCanContribute(member, "proj-1")).resolves.toBeUndefined();
    });

    it("admits a team lead", async () => {
      memberRepo.getRole.mockResolvedValue("team_lead");
      await expect(service.assertCanContribute(member, "proj-1")).resolves.toBeUndefined();
    });

    it("turns away a read-only stakeholder with a message that says why", async () => {
      // Without this tier a Viewer, who passes the access check for every
      // project, would inherit write access the moment the platform-level write
      // permissions went away.
      await expect(service.assertCanContribute(viewer, "proj-1")).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining("read-only"),
      });
    });

    it("turns away someone with no access", async () => {
      await expect(service.assertCanContribute(member, "proj-1")).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe("managing a project", () => {
    const leadOnly = { id: "u-7", organizationId: "org-1", permissions: new Set(["project.read"]) };

    beforeEach(() => {
      projectRepo.findById.mockResolvedValue({ ...project });
      projectRepo.save.mockImplementation(async (e) => e);
      testCaseRepo.hasAssignmentInProject.mockResolvedValue(false);
    });

    it("lets a team lead edit their own project", async () => {
      memberRepo.getRole.mockResolvedValue("team_lead");
      await expect(service.updateProject(leadOnly, "proj-1", { name: "Renamed" })).resolves.toBeDefined();
    });

    it("stops an ordinary member editing it", async () => {
      // updateProject used to lean on the route guard alone.
      memberRepo.getRole.mockResolvedValue("member");
      await expect(service.updateProject(leadOnly, "proj-1", { name: "Nope" })).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(projectRepo.save).not.toHaveBeenCalled();
    });

    it("stops an ordinary member deleting it, and lets the lead", async () => {
      memberRepo.getRole.mockResolvedValue("member");
      await expect(service.deleteProject(leadOnly, "proj-1")).rejects.toMatchObject({ statusCode: 403 });
      expect(projectRepo.softDelete).not.toHaveBeenCalled();

      memberRepo.getRole.mockResolvedValue("team_lead");
      await service.deleteProject(leadOnly, "proj-1");
      expect(projectRepo.softDelete).toHaveBeenCalledWith("proj-1");
    });

    it("keeps creating a project behind project.manageall — there is no project yet to lead", async () => {
      await expect(
        service.createProject(leadOnly, { name: "New" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(projectRepo.create).not.toHaveBeenCalled();
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

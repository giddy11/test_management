// modules/access/tests/access.service.spec.js
//
// The guards that stop an organisation locking itself out of its own access
// control, and the no-escalation rule that stops role.manage being used to
// bootstrap past your own ceiling.
const { AccessService } = require("../services/access.service");

function makeRepo(overrides = {}) {
  return {
    findRoleById: jest.fn(),
    findRoleByName: jest.fn().mockResolvedValue(null),
    findRoleByKey: jest.fn(),
    permissionsForRole: jest.fn().mockResolvedValue([]),
    validPermissionCodes: jest.fn(async (codes) => codes),
    createRole: jest.fn(async (d) => ({ id: "new-role", ...d })),
    updateRole: jest.fn(),
    deleteRole: jest.fn(),
    setRolePermissions: jest.fn(),
    countMembers: jest.fn().mockResolvedValue(0),
    setUserRoles: jest.fn(),
    rolesForUser: jest.fn().mockResolvedValue([]),
    roleIdsGranting: jest.fn().mockResolvedValue([]),
    userIdsWithPermission: jest.fn().mockResolvedValue([]),
    superAdminUserIds: jest.fn().mockResolvedValue([]),
    fetchRolesForOrg: jest.fn().mockResolvedValue([]),
    fetchCatalog: jest.fn(),
    ...overrides,
  };
}

const activity = { log: jest.fn() };

// An organisation administrator: holds role.manage, but not the wildcard.
const admin = {
  id: "admin-1",
  organizationId: "org-1",
  permissions: new Set([
    "role.read",
    "role.manage",
    "role.assign",
    "project.read",
    "project.export",
    "user.read",
  ]),
};
const superAdmin = { id: "super-1", organizationId: "org-1", permissions: new Set(["*"]) };

const customRole = {
  id: "role-custom",
  organizationId: "org-1",
  key: null,
  name: "Release manager",
  isBuiltin: false,
  isLocked: false,
};
const builtinRole = { ...customRole, id: "role-builtin", key: "qa_engineer", name: "QA engineer", isBuiltin: true };
const lockedRole = {
  id: "role-locked",
  organizationId: null,
  key: "super_admin",
  name: "Super administrator",
  isBuiltin: true,
  isLocked: true,
};

describe("AccessService", () => {
  let repo;
  let service;

  beforeEach(() => {
    repo = makeRepo();
    service = new AccessService(repo, activity);
  });

  describe("organisation isolation", () => {
    it("404s a role belonging to another organisation rather than admitting it exists", () => {
      repo.findRoleById.mockResolvedValue({ ...customRole, organizationId: "org-2" });
      return expect(service.getRole(admin, "role-custom")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("shows the platform-level role to a super administrator", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      const role = await service.getRole(superAdmin, "role-locked");
      expect(role.id).toBe("role-locked");
    });

    it("404s the platform-level role for an organisation administrator", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      await expect(service.getRole(admin, "role-locked")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("only asks for the platform-level role when listing for a super administrator", async () => {
      await service.fetchRoles(admin);
      expect(repo.fetchRolesForOrg).toHaveBeenLastCalledWith("org-1", { includePlatform: false });

      await service.fetchRoles(superAdmin);
      expect(repo.fetchRolesForOrg).toHaveBeenLastCalledWith("org-1", { includePlatform: true });
    });
  });

  describe("the locked role", () => {
    it("cannot be edited", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      await expect(
        service.updateRole(superAdmin, "role-locked", { permissions: [] })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(repo.setRolePermissions).not.toHaveBeenCalled();
    });

    it("cannot be edited or deleted by an organisation administrator, who cannot see it", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      await expect(
        service.updateRole(admin, "role-locked", { permissions: [] })
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.deleteRole(admin, "role-locked")).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(repo.setRolePermissions).not.toHaveBeenCalled();
      expect(repo.deleteRole).not.toHaveBeenCalled();
    });

    it("cannot be deleted, even by a super administrator", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      await expect(service.deleteRole(superAdmin, "role-locked")).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(repo.deleteRole).not.toHaveBeenCalled();
    });

    it("cannot be cloned into a second wildcard holder", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      repo.permissionsForRole.mockResolvedValue(["*"]);
      await service.createRole(superAdmin, { name: "Sneaky", cloneFromId: "role-locked" });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("new-role", []);
    });

    it("cannot be cloned by an organisation administrator, who cannot see it", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      await expect(
        service.createRole(admin, { name: "Sneaky", cloneFromId: "role-locked" })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(repo.createRole).not.toHaveBeenCalled();
    });
  });

  describe("built-in roles", () => {
    it("keep a fixed name but an editable permission set", async () => {
      repo.findRoleById.mockResolvedValue(builtinRole);
      repo.permissionsForRole.mockResolvedValue(["project.read"]);
      repo.roleIdsGranting.mockResolvedValue(["role-other"]);

      await expect(
        service.updateRole(admin, "role-builtin", { name: "Renamed" })
      ).rejects.toMatchObject({ statusCode: 400 });

      await service.updateRole(admin, "role-builtin", { permissions: ["project.read", "project.export"] });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("role-builtin", [
        "project.read",
        "project.export",
      ]);
    });

    it("cannot be deleted", async () => {
      repo.findRoleById.mockResolvedValue(builtinRole);
      await expect(service.deleteRole(admin, "role-builtin")).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe("custom role deletion", () => {
    it("is refused while the role still has members", async () => {
      repo.findRoleById.mockResolvedValue(customRole);
      repo.countMembers.mockResolvedValue(3);
      await expect(service.deleteRole(admin, "role-custom")).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(repo.deleteRole).not.toHaveBeenCalled();
    });

    it("goes ahead at zero members", async () => {
      repo.findRoleById.mockResolvedValue(customRole);
      repo.countMembers.mockResolvedValue(0);
      repo.roleIdsGranting.mockResolvedValue(["role-other"]);
      await service.deleteRole(admin, "role-custom");
      expect(repo.deleteRole).toHaveBeenCalledWith("role-custom");
    });
  });

  describe("lockout guards", () => {
    it("refuses to remove role.manage from the last role that grants it", async () => {
      repo.findRoleById.mockResolvedValue(builtinRole);
      repo.permissionsForRole.mockResolvedValue(["role.manage"]);
      // Only this role grants it.
      repo.roleIdsGranting.mockResolvedValue(["role-builtin"]);

      await expect(
        service.updateRole(admin, "role-builtin", { permissions: ["project.read"] })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(repo.setRolePermissions).not.toHaveBeenCalled();
    });

    it("allows it while another role still grants role.manage", async () => {
      repo.findRoleById.mockResolvedValue(builtinRole);
      repo.permissionsForRole.mockResolvedValue(["role.manage"]);
      repo.roleIdsGranting.mockResolvedValue(["role-builtin", "role-other"]);
      repo.userIdsWithPermission.mockResolvedValue([]);

      await service.updateRole(admin, "role-builtin", { permissions: ["project.read"] });
      expect(repo.setRolePermissions).toHaveBeenCalled();
    });

    it("refuses to delete the last role that grants role.manage", async () => {
      repo.findRoleById.mockResolvedValue(customRole);
      repo.countMembers.mockResolvedValue(0);
      repo.roleIdsGranting.mockResolvedValue(["role-custom"]);
      await expect(service.deleteRole(admin, "role-custom")).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it("refuses to strip the last person who can manage roles", async () => {
      repo.rolesForUser.mockResolvedValue([builtinRole]);
      repo.permissionsForRole.mockResolvedValue(["role.manage"]);
      // Only this user holds it.
      repo.userIdsWithPermission.mockResolvedValue(["victim-1"]);

      await expect(service.setUserRoles(admin, "victim-1", [])).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(repo.setUserRoles).not.toHaveBeenCalled();
    });

    it("refuses to let the last role manager demote themselves", async () => {
      repo.rolesForUser.mockResolvedValue([builtinRole]);
      repo.permissionsForRole.mockResolvedValue(["role.manage"]);
      repo.userIdsWithPermission.mockResolvedValue([admin.id]);

      await expect(service.setUserRoles(admin, admin.id, [])).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining("You are the last person"),
      });
    });

    it("allows the change while someone else still holds role.manage", async () => {
      repo.rolesForUser.mockResolvedValue([builtinRole]);
      repo.permissionsForRole.mockResolvedValue(["role.manage"]);
      repo.userIdsWithPermission.mockResolvedValue(["victim-1", "someone-else"]);

      await service.setUserRoles(admin, "victim-1", []);
      expect(repo.setUserRoles).toHaveBeenCalledWith("victim-1", [], admin.id);
    });

    it("refuses to remove the last super administrator", async () => {
      repo.rolesForUser.mockResolvedValue([lockedRole]);
      repo.permissionsForRole.mockResolvedValue(["*"]);
      repo.userIdsWithPermission.mockResolvedValue(["victim-1", "someone-else"]);
      repo.superAdminUserIds.mockResolvedValue(["victim-1"]);

      await expect(service.setUserRoles(superAdmin, "victim-1", [])).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining("last super administrator"),
      });
    });

    it("assertUserRemovable applies the same rules before a user is deleted", async () => {
      repo.rolesForUser.mockResolvedValue([builtinRole]);
      repo.permissionsForRole.mockResolvedValue(["role.manage"]);
      repo.userIdsWithPermission.mockResolvedValue(["victim-1"]);
      await expect(service.assertUserRemovable(admin, "victim-1")).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe("no privilege escalation", () => {
    it("stops an administrator granting a permission they do not hold", async () => {
      await expect(
        service.createRole(admin, { name: "Overreach", permissions: ["platform.read"] })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(repo.createRole).not.toHaveBeenCalled();
    });

    it("names the permissions that were out of reach", async () => {
      await expect(
        service.createRole(admin, {
          name: "Overreach",
          permissions: ["project.read", "platform.read", "announcement.manage"],
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining("platform.read, announcement.manage"),
      });
    });

    it("lets an administrator grant what they do hold", async () => {
      await service.createRole(admin, {
        name: "Reader",
        permissions: ["project.read", "project.export"],
      });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("new-role", [
        "project.read",
        "project.export",
      ]);
    });

    it("exempts a super administrator, who holds everything", async () => {
      await service.createRole(superAdmin, {
        name: "Anything",
        permissions: ["platform.read", "announcement.manage"],
      });
      expect(repo.createRole).toHaveBeenCalled();
    });

    it("applies to assigning a role, not just writing one", async () => {
      // Assigning a role grants every permission in it.
      repo.findRoleById.mockResolvedValue(customRole);
      repo.permissionsForRole.mockResolvedValue(["platform.read"]);
      await expect(
        service.setUserRoles(admin, "someone", ["role-custom"])
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(repo.setUserRoles).not.toHaveBeenCalled();
    });

    it("lets only a super administrator hand out the locked role", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      repo.permissionsForRole.mockResolvedValue(["*"]);
      // An organisation administrator cannot even see it, so it 404s.
      await expect(
        service.setUserRoles(admin, "someone", ["role-locked"])
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(repo.setUserRoles).not.toHaveBeenCalled();

      repo.superAdminUserIds.mockResolvedValue(["super-1", "other-super"]);
      await service.setUserRoles(superAdmin, "someone", ["role-locked"]);
      expect(repo.setUserRoles).toHaveBeenCalledWith("someone", ["role-locked"], "super-1");
    });
  });

  // The admin holds project.* but not the client company's support queue, so a
  // role like Support lead carries permissions the admin cannot see or grant.
  describe("permissions the actor does not hold", () => {
    const supportLead = {
      ...builtinRole,
      id: "role-support",
      key: "support_lead",
      name: "Support lead",
    };
    const supportLeadCodes = ["project.read", "supportqueue.read", "supportqueue.send"];

    it("leaves them out of the catalog, and drops a category left empty", async () => {
      repo.fetchCatalog.mockResolvedValue({
        categories: [{ key: "projects" }, { key: "support" }],
        permissions: [
          { code: "project.read", category: "projects" },
          { code: "supportqueue.read", category: "support" },
          { code: "supportqueue.send", category: "support" },
        ],
      });

      const seen = await service.fetchCatalog(admin);
      expect(seen.permissions.map((p) => p.code)).toEqual(["project.read"]);
      expect(seen.categories.map((c) => c.key)).toEqual(["projects"]);
    });

    it("shows a super administrator the whole catalog", async () => {
      repo.fetchCatalog.mockResolvedValue({
        categories: [{ key: "projects" }, { key: "support" }],
        permissions: [
          { code: "project.read", category: "projects" },
          { code: "supportqueue.send", category: "support" },
        ],
      });

      const seen = await service.fetchCatalog(superAdmin);
      expect(seen.permissions).toHaveLength(2);
      expect(seen.categories).toHaveLength(2);
    });

    it("counts only the visible ones in a role's permissions and total", async () => {
      repo.fetchRolesForOrg.mockResolvedValue([
        { ...supportLead, permissions: supportLeadCodes, permissionCount: 3, memberCount: 2 },
      ]);

      const [asAdmin] = await service.fetchRoles(admin);
      expect(asAdmin.permissions).toEqual(["project.read"]);
      expect(asAdmin.permissionCount).toBe(1);
      expect(asAdmin.memberCount).toBe(2);

      const [asSuper] = await service.fetchRoles(superAdmin);
      expect(asSuper.permissions).toEqual(supportLeadCodes);
      expect(asSuper.permissionCount).toBe(3);
    });

    it("applies the same view to a single role", async () => {
      repo.findRoleById.mockResolvedValue(supportLead);
      repo.permissionsForRole.mockResolvedValue(supportLeadCodes);

      const role = await service.getRole(admin, "role-support");
      expect(role.permissions).toEqual(["project.read"]);
      expect(role.permissionCount).toBe(1);
    });

    it("are kept on the role when the visible part is edited", async () => {
      repo.findRoleById.mockResolvedValue(supportLead);
      repo.permissionsForRole.mockResolvedValue(supportLeadCodes);
      repo.roleIdsGranting.mockResolvedValue(["role-other"]);

      await service.updateRole(admin, "role-support", {
        permissions: ["project.read", "project.export"],
      });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("role-support", [
        "project.read",
        "project.export",
        "supportqueue.read",
        "supportqueue.send",
      ]);
    });

    it("cannot be cleared away by clearing everything the admin can see", async () => {
      repo.findRoleById.mockResolvedValue(supportLead);
      repo.permissionsForRole.mockResolvedValue(supportLeadCodes);
      repo.roleIdsGranting.mockResolvedValue(["role-other"]);

      await service.updateRole(admin, "role-support", { permissions: [] });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("role-support", [
        "supportqueue.read",
        "supportqueue.send",
      ]);
    });

    it("do not trip the escalation check when the role already has them", async () => {
      repo.findRoleById.mockResolvedValue(supportLead);
      repo.permissionsForRole.mockResolvedValue(supportLeadCodes);
      repo.roleIdsGranting.mockResolvedValue(["role-other"]);

      await service.updateRole(admin, "role-support", {
        permissions: ["project.read", "supportqueue.send"],
      });
      expect(repo.setRolePermissions).toHaveBeenCalled();
    });

    it("still cannot be newly granted", async () => {
      repo.findRoleById.mockResolvedValue({ ...supportLead, key: null, isBuiltin: false });
      repo.permissionsForRole.mockResolvedValue(["project.read"]);

      await expect(
        service.updateRole(admin, "role-support", {
          permissions: ["project.read", "supportqueue.send"],
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining("supportqueue.send"),
      });
      expect(repo.setRolePermissions).not.toHaveBeenCalled();
    });

    it("are edited freely by a super administrator", async () => {
      repo.findRoleById.mockResolvedValue(supportLead);
      repo.permissionsForRole.mockResolvedValue(supportLeadCodes);
      repo.roleIdsGranting.mockResolvedValue(["role-other"]);

      await service.updateRole(superAdmin, "role-support", { permissions: ["project.read"] });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("role-support", ["project.read"]);
    });

    it("are left out of a copy rather than failing the clone", async () => {
      repo.findRoleById.mockResolvedValue(supportLead);
      repo.permissionsForRole.mockResolvedValue(supportLeadCodes);

      await service.createRole(admin, { name: "My support", cloneFromId: "role-support" });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("new-role", ["project.read"]);
    });
  });

  describe("catalog validation", () => {
    it("rejects a permission code that is not in the catalog", async () => {
      repo.validPermissionCodes.mockResolvedValue([]);
      await expect(
        service.createRole(superAdmin, { name: "Typo", permissions: ["projct.read"] })
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("projct.read") });
    });

    it("refuses the wildcard outright", async () => {
      await expect(
        service.createRole(superAdmin, { name: "Sneaky", permissions: ["*"] })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a duplicate role name in the same organisation", async () => {
      repo.findRoleByName.mockResolvedValue(customRole);
      await expect(
        service.createRole(admin, { name: "Release manager" })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe("audit", () => {
    it("records the before and after of a permission change", async () => {
      repo.findRoleById.mockResolvedValue(builtinRole);
      repo.permissionsForRole.mockResolvedValue(["project.read"]);
      repo.roleIdsGranting.mockResolvedValue(["role-other"]);
      activity.log.mockClear();

      await service.updateRole(admin, "role-builtin", {
        permissions: ["project.read", "project.export"],
      });

      expect(activity.log).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({
          action: "role.permissions_changed",
          entityType: "role",
          entityId: "role-builtin",
          metadata: expect.objectContaining({
            before: expect.objectContaining({ permissions: ["project.read"] }),
            after: expect.objectContaining({
              permissions: ["project.read", "project.export"],
            }),
          }),
        })
      );
    });

    it("records who was given which roles", async () => {
      repo.findRoleById.mockResolvedValue(customRole);
      repo.permissionsForRole.mockResolvedValue(["project.read"]);
      activity.log.mockClear();

      await service.setUserRoles(admin, "target-1", ["role-custom"]);

      expect(activity.log).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({ action: "role.assigned", entityId: "target-1" })
      );
    });
  });
});

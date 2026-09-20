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
    "project.update",
    "result.enter",
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
const builtinRole = { ...customRole, id: "role-builtin", key: "qa_manager", name: "QA manager", isBuiltin: true };
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

    it("lets everyone see the platform-level role", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      const role = await service.getRole(admin, "role-locked");
      expect(role.id).toBe("role-locked");
    });
  });

  describe("the locked role", () => {
    it("cannot be edited", async () => {
      repo.findRoleById.mockResolvedValue(lockedRole);
      await expect(
        service.updateRole(admin, "role-locked", { permissions: [] })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(repo.setRolePermissions).not.toHaveBeenCalled();
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
      await service.createRole(admin, { name: "Sneaky", cloneFromId: "role-locked" });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("new-role", []);
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

      await service.updateRole(admin, "role-builtin", { permissions: ["project.read", "project.update"] });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("role-builtin", [
        "project.read",
        "project.update",
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
          permissions: ["project.read", "platform.read", "settings.manage"],
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining("platform.read, settings.manage"),
      });
    });

    it("lets an administrator grant what they do hold", async () => {
      await service.createRole(admin, {
        name: "Reader",
        permissions: ["project.read", "project.update"],
      });
      expect(repo.setRolePermissions).toHaveBeenCalledWith("new-role", [
        "project.read",
        "project.update",
      ]);
    });

    it("exempts a super administrator, who holds everything", async () => {
      await service.createRole(superAdmin, {
        name: "Anything",
        permissions: ["platform.read", "settings.manage"],
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
      await expect(
        service.setUserRoles(admin, "someone", ["role-locked"])
      ).rejects.toMatchObject({ statusCode: 403 });

      repo.superAdminUserIds.mockResolvedValue(["super-1", "other-super"]);
      await service.setUserRoles(superAdmin, "someone", ["role-locked"]);
      expect(repo.setUserRoles).toHaveBeenCalledWith("someone", ["role-locked"], "super-1");
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
        permissions: ["project.read", "project.update"],
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
              permissions: ["project.read", "project.update"],
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

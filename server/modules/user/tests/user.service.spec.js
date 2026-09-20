// modules/user/tests/user.service.spec.js
//
// The service now receives the request actor (id + resolved permissions)
// instead of an actor id, and checks capability with can()/hasWildcard()
// instead of comparing role names. The protections asserted here are the same
// ones as before: organisation isolation, org-owner protection, and the
// self-service guards — plus the new lockout guard on removal.
const { UserService } = require("../services/user.service");
const { UserRole } = require("../../../config/constants");

function makeRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    findOrgOwnerId: jest.fn().mockResolvedValue(null),
  };
}

function makeAccessService() {
  return {
    setUserRoles: jest.fn().mockResolvedValue([]),
    // Lets the last-role-manager guard through unless a test overrides it.
    assertUserRemovable: jest.fn().mockResolvedValue(undefined),
  };
}

function makeAccessRepo() {
  return {
    rolesForUser: jest.fn().mockResolvedValue([]),
    findRoleByKey: jest.fn().mockResolvedValue({ id: "role-qa" }),
  };
}

// Stored rows, as the repository returns them.
const admin = {
  id: "admin-1",
  role: UserRole.ADMIN,
  organizationId: "org-1",
  companyName: "Acme",
};

// Request actors, as authMiddleware + permissionsMiddleware produce them.
const adminActor = {
  id: "admin-1",
  permissions: new Set([
    "user.read",
    "user.create",
    "user.update",
    "user.delete",
    "role.assign",
  ]),
};
const superActor = { id: "super-1", permissions: new Set(["*"]) };
const ownerActor = { id: "owner-1", permissions: new Set(["user.update"]) };

describe("UserService", () => {
  let repo;
  let access;
  let accessRepo;
  let service;

  beforeEach(() => {
    repo = makeRepo();
    access = makeAccessService();
    accessRepo = makeAccessRepo();
    service = new UserService(repo, access, accessRepo);
  });

  describe("fetchUsers", () => {
    it("scopes an admin to their organisation", async () => {
      repo.findById.mockResolvedValue(admin);
      repo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchUsers(adminActor, { page: 1, limit: 20 });
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" })
      );
    });

    it("scopes a super administrator to their own organisation too", async () => {
      repo.findById.mockResolvedValue({ ...admin, id: "super-1" });
      repo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchUsers(superActor, { page: 1, limit: 20 });
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" })
      );
    });
  });

  describe("getUser", () => {
    it("blocks access to a user in another organisation", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "admin-1" ? admin : { id, organizationId: "org-2", deletedAt: null }
      );
      await expect(service.getUser(adminActor, "u-9")).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("lets a super administrator reach a user in another organisation", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "super-1"
          ? { ...admin, id: "super-1" }
          : { id, organizationId: "org-2", deletedAt: null }
      );
      const found = await service.getUser(superActor, "u-9");
      expect(found.id).toBe("u-9");
    });

    it("throws 404 when the user is missing", async () => {
      repo.findById.mockImplementation(async (id) => (id === "admin-1" ? admin : null));
      await expect(service.getUser(adminActor, "ghost")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("createUser", () => {
    it("creates an org member with a hashed password and a default role", async () => {
      repo.findById.mockResolvedValue(admin);
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockImplementation(async (d) => ({ id: "u-2", ...d }));

      const created = await service.createUser(adminActor, {
        firstName: "Mem",
        lastName: "Ber",
        email: "mem@acme.com",
        password: "Passw0rd",
        role: "user",
      });

      const payload = repo.create.mock.calls[0][0];
      expect(payload.organizationId).toBe("org-1");
      expect(payload.isEmailVerified).toBe(true);
      expect(payload.password).not.toBe("Passw0rd"); // hashed
      expect(created.id).toBe("u-2");
    });

    it("grants the new account the built-in role its legacy role maps to", async () => {
      repo.findById.mockResolvedValue(admin);
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockImplementation(async (d) => ({ id: "u-2", ...d }));

      await service.createUser(adminActor, {
        firstName: "Mem",
        lastName: "Ber",
        email: "mem@acme.com",
        password: "Passw0rd",
        role: "user",
      });

      expect(accessRepo.findRoleByKey).toHaveBeenCalledWith("org-1", "qa_engineer");
      expect(access.setUserRoles).toHaveBeenCalledWith(
        expect.objectContaining({ id: "admin-1" }),
        "u-2",
        ["role-qa"]
      );
    });

    it("prefers explicit roleIds over the legacy mapping", async () => {
      repo.findById.mockResolvedValue(admin);
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockImplementation(async (d) => ({ id: "u-2", ...d }));

      await service.createUser(adminActor, {
        firstName: "Mem",
        lastName: "Ber",
        email: "mem@acme.com",
        password: "Passw0rd",
        roleIds: ["role-lead"],
      });

      expect(access.setUserRoles).toHaveBeenCalledWith(
        expect.anything(),
        "u-2",
        ["role-lead"]
      );
    });

    it("throws 409 on a duplicate email", async () => {
      repo.findById.mockResolvedValue(admin);
      repo.findByEmail.mockResolvedValue({ id: "exists" });
      await expect(
        service.createUser(adminActor, {
          firstName: "a",
          lastName: "b",
          email: "dup@acme.com",
          password: "Passw0rd",
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe("updateUser", () => {
    it("prevents changing your own role", async () => {
      repo.findById.mockResolvedValue(admin); // actor and target are the same
      await expect(
        service.updateUser(adminActor, "admin-1", { role: "user" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("prevents another admin from editing the organisation owner (role or name)", async () => {
      const owner = {
        id: "owner-1",
        role: UserRole.ADMIN,
        organizationId: "org-1",
        deletedAt: null,
      };
      repo.findById.mockImplementation(async (id) => (id === "admin-1" ? admin : owner));
      repo.findOrgOwnerId.mockResolvedValue("owner-1");
      await expect(
        service.updateUser(adminActor, "owner-1", { role: "user" })
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        service.updateUser(adminActor, "owner-1", { firstName: "Hacked" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it("lets the owner edit their own details", async () => {
      const owner = {
        id: "owner-1",
        role: UserRole.ADMIN,
        organizationId: "org-1",
        deletedAt: null,
      };
      repo.findById.mockResolvedValue(owner);
      repo.findOrgOwnerId.mockResolvedValue("owner-1");
      repo.update.mockResolvedValue({ ...owner, firstName: "Renamed" });
      await service.updateUser(ownerActor, "owner-1", { firstName: "Renamed" });
      expect(repo.update).toHaveBeenCalledWith("owner-1", { firstName: "Renamed" });
    });
  });

  describe("setRoles", () => {
    it("delegates to AccessService, which owns the lockout guards", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "admin-1" ? admin : { id, organizationId: "org-1", deletedAt: null }
      );
      await service.setRoles(adminActor, "u-3", ["role-lead"]);
      expect(access.setUserRoles).toHaveBeenCalledWith(adminActor, "u-3", ["role-lead"]);
    });

    it("refuses to manage a supporter account from the team screen", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "admin-1"
          ? admin
          : { id, organizationId: "org-1", role: UserRole.IT_SUPPORT, deletedAt: null }
      );
      await expect(
        service.setRoles(adminActor, "sup-1", ["role-lead"])
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(access.setUserRoles).not.toHaveBeenCalled();
    });
  });

  describe("deactivateUser", () => {
    it("prevents deactivating yourself", async () => {
      await expect(
        service.deactivateUser(adminActor, "admin-1")
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("soft-deletes another member", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "admin-1" ? admin : { id, organizationId: "org-1", deletedAt: null }
      );
      await service.deactivateUser(adminActor, "u-3");
      expect(repo.softDelete).toHaveBeenCalledWith("u-3");
    });

    it("prevents an admin from deactivating the organisation owner", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "admin-1" ? admin : { id, organizationId: "org-1", deletedAt: null }
      );
      repo.findOrgOwnerId.mockResolvedValue("owner-1");
      await expect(
        service.deactivateUser(adminActor, "owner-1")
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it("lets a super administrator deactivate the organisation owner", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "super-1"
          ? { ...admin, id: "super-1" }
          : { id, organizationId: "org-1", deletedAt: null }
      );
      repo.findOrgOwnerId.mockResolvedValue("owner-1");
      await service.deactivateUser(superActor, "owner-1");
      expect(repo.softDelete).toHaveBeenCalledWith("owner-1");
    });

    it("refuses to remove the last person who can manage roles", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "admin-1" ? admin : { id, organizationId: "org-1", deletedAt: null }
      );
      access.assertUserRemovable.mockRejectedValue(
        Object.assign(new Error("last role manager"), { statusCode: 409 })
      );
      await expect(
        service.deactivateUser(adminActor, "u-3")
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });
});

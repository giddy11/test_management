// modules/user/tests/user.service.spec.js
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
  };
}

const admin = {
  id: "admin-1",
  role: UserRole.ADMIN,
  organizationId: "org-1",
  companyName: "Acme",
};

describe("UserService", () => {
  let repo;
  let service;

  beforeEach(() => {
    repo = makeRepo();
    service = new UserService(repo);
  });

  describe("fetchUsers", () => {
    it("scopes an admin to their organisation", async () => {
      repo.findById.mockResolvedValue(admin);
      repo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchUsers("admin-1", { page: 1, limit: 20 });
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" })
      );
    });

    it("does not scope a superadmin", async () => {
      repo.findById.mockResolvedValue({ ...admin, role: UserRole.SUPERADMIN });
      repo.fetchPaginated.mockResolvedValue({ data: [], meta: {} });
      await service.fetchUsers("admin-1", { page: 1, limit: 20 });
      expect(repo.fetchPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: undefined })
      );
    });
  });

  describe("getUser", () => {
    it("blocks access to a user in another organisation", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "admin-1" ? admin : { id, organizationId: "org-2", deletedAt: null }
      );
      await expect(service.getUser("admin-1", "u-9")).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("throws 404 when the user is missing", async () => {
      repo.findById.mockImplementation(async (id) => (id === "admin-1" ? admin : null));
      await expect(service.getUser("admin-1", "ghost")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("createUser", () => {
    it("creates an org member with hashed password and default role user", async () => {
      repo.findById.mockResolvedValue(admin);
      repo.findByEmail.mockResolvedValue(null);
      repo.create.mockImplementation(async (d) => ({ id: "u-2", ...d }));

      const created = await service.createUser("admin-1", {
        firstName: "Mem",
        lastName: "Ber",
        email: "mem@acme.com",
        password: "Passw0rd",
        role: "user",
      });

      const payload = repo.create.mock.calls[0][0];
      expect(payload.organizationId).toBe("org-1");
      expect(payload.role).toBe("user");
      expect(payload.isEmailVerified).toBe(true);
      expect(payload.password).not.toBe("Passw0rd"); // hashed
      expect(created.id).toBe("u-2");
    });

    it("throws 409 on a duplicate email", async () => {
      repo.findById.mockResolvedValue(admin);
      repo.findByEmail.mockResolvedValue({ id: "exists" });
      await expect(
        service.createUser("admin-1", {
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
        service.updateUser("admin-1", "admin-1", { role: "user" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("deactivateUser", () => {
    it("prevents deactivating yourself", async () => {
      await expect(
        service.deactivateUser("admin-1", "admin-1")
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("soft-deletes another member", async () => {
      repo.findById.mockImplementation(async (id) =>
        id === "admin-1" ? admin : { id, organizationId: "org-1", deletedAt: null }
      );
      await service.deactivateUser("admin-1", "u-3");
      expect(repo.softDelete).toHaveBeenCalledWith("u-3");
    });
  });
});

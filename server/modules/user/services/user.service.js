// modules/user/services/user.service.js
const crypto = require("crypto");
const { UserRepository } = require("../repositories/user.repository");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, AuthProvider } = require("../../../config/constants");
const { hashPassword } = require("../../../shared/utils/password");

class UserService {
  static Instance = new UserService();

  constructor(userRepo = UserRepository.Instance) {
    this.userRepo = userRepo;
  }

  async loadActor(actorId) {
    const actor = await this.userRepo.findById(actorId);
    if (!actor) throw new AppError("Account not found", 404);
    return actor;
  }

  isSuperadmin(actor) {
    return actor.role === UserRole.SUPERADMIN;
  }

  async fetchUsers(actorId, params) {
    const actor = await this.loadActor(actorId);
    const organizationId = this.isSuperadmin(actor)
      ? undefined
      : actor.organizationId;
    return this.userRepo.fetchPaginated({ ...params, organizationId });
  }

  async getUser(actorId, id) {
    const actor = await this.loadActor(actorId);
    const target = await this.userRepo.findById(id);
    if (!target || target.deletedAt) throw new AppError("User not found", 404);
    if (!this.isSuperadmin(actor) && target.organizationId !== actor.organizationId) {
      throw new AppError("You do not have access to this user", 403);
    }
    return target;
  }

  async createUser(actorId, data) {
    const actor = await this.loadActor(actorId);

    const existing = await this.userRepo.findByEmail(data.email);
    if (existing) throw new AppError("An account with this email already exists", 409);

    return this.userRepo.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: await hashPassword(data.password),
      role: data.role ?? UserRole.USER,
      companyName: actor.companyName,
      organizationId: actor.organizationId ?? crypto.randomUUID(),
      provider: AuthProvider.LOCAL,
      isEmailVerified: true, // created by an admin — no self-verification needed
    });
  }

  async updateUser(actorId, id, data) {
    const target = await this.getUser(actorId, id);
    if (id === actorId && data.role && data.role !== target.role) {
      throw new AppError("You cannot change your own role", 400);
    }

    const patch = {};
    if (data.firstName !== undefined) patch.firstName = data.firstName;
    if (data.lastName !== undefined) patch.lastName = data.lastName;
    if (data.role !== undefined) patch.role = data.role;
    return this.userRepo.update(target.id, patch);
  }

  async deactivateUser(actorId, id) {
    if (id === actorId) {
      throw new AppError("You cannot deactivate your own account", 400);
    }
    const target = await this.getUser(actorId, id);
    await this.userRepo.softDelete(target.id);
  }
}

module.exports = { UserService };

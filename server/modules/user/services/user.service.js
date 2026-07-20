// modules/user/services/user.service.js
const crypto = require("crypto");
const { UserRepository } = require("../repositories/user.repository");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, AuthProvider } = require("../../../config/constants");
const { hashPassword } = require("../../../shared/utils/password");
const { sendWelcomeEmail } = require("../../../shared/utils/mailer");
const { ActivityService } = require("../../activity/services/activity.service");
const { env } = require("../../../config/env");

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

  // True when `user` is the account that created their organisation. The owner is
  // protected from being deactivated or role-demoted by other admins.
  async isOrgOwner(user) {
    if (!user?.organizationId) return false;
    const ownerId = await this.userRepo.findOrgOwnerId(user.organizationId);
    return ownerId != null && user.id === ownerId;
  }

  async fetchUsers(actorId, params) {
    const actor = await this.loadActor(actorId);
    // Superadmin's own org is never a real client company, so this is
    // deliberately scoped the same as any other admin — not the whole platform.
    const organizationId = actor.organizationId;
    const result = await this.userRepo.fetchPaginated({ ...params, organizationId });

    // Flag the org owner so the client can protect them in the UI.
    if (organizationId) {
      const ownerId = await this.userRepo.findOrgOwnerId(organizationId);
      result.data.forEach((u) => {
        u.isOrgOwner = ownerId != null && u.id === ownerId;
      });
    }
    return result;
  }

  async getUser(actorId, id) {
    const actor = await this.loadActor(actorId);
    const target = await this.userRepo.findById(id);
    if (!target || target.deletedAt) throw new AppError("User not found", 404);
    // Superadmin keeps cross-org lookup here only for the moderation path in
    // updateUser/deactivateUser below — there's no UI listing that surfaces
    // another org's user ids, so this isn't a "browse other companies" leak.
    if (!this.isSuperadmin(actor) && target.organizationId !== actor.organizationId) {
      throw new AppError("You do not have access to this user", 403);
    }
    return target;
  }

  async createUser(actorId, data) {
    const actor = await this.loadActor(actorId);

    const existing = await this.userRepo.findByEmail(data.email);
    if (existing) throw new AppError("An account with this email already exists", 409);

    const user = await this.userRepo.create({
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

    const loginUrl = `${env.appUrl}/login`;
    sendWelcomeEmail(user.email, user.firstName, data.password, loginUrl, user.organizationId).catch((err) =>
      console.error("[mailer] welcome email failed:", err.message)
    );

    ActivityService.Instance.log(actor, {
      action: "user.created",
      summary: `Added ${user.firstName} ${user.lastName} (${user.role})`,
      entityType: "user",
      entityId: user.id,
    });

    return user;
  }

  async updateUser(actorId, id, data) {
    const actor = await this.loadActor(actorId);
    const target = await this.getUser(actorId, id);
    // IT supporter accounts are managed from their client company, not here.
    if (target.role === UserRole.IT_SUPPORT) {
      throw new AppError("Supporter accounts are managed under their client company", 403);
    }
    if (id === actorId && data.role && data.role !== target.role) {
      throw new AppError("You cannot change your own role", 400);
    }

    // The organisation owner's details (name, role, …) can only be edited by the
    // owner themselves or a platform superadmin — never by another org admin.
    if (id !== actorId && !this.isSuperadmin(actor) && (await this.isOrgOwner(target))) {
      throw new AppError("You cannot edit the organisation owner", 403);
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
    const actor = await this.loadActor(actorId);
    const target = await this.getUser(actorId, id);
    // IT supporter accounts are managed from their client company, not here.
    if (target.role === UserRole.IT_SUPPORT) {
      throw new AppError("Supporter accounts are managed under their client company", 403);
    }

    // The account that created the organisation can never be blocked by another
    // admin — only a platform superadmin may (for moderation).
    if (!this.isSuperadmin(actor) && (await this.isOrgOwner(target))) {
      throw new AppError("You cannot deactivate the organisation owner", 403);
    }

    await this.userRepo.softDelete(target.id);
  }
}

module.exports = { UserService };

// modules/user/services/user.service.js
const crypto = require("crypto");
const { UserRepository } = require("../repositories/user.repository");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, AuthProvider } = require("../../../config/constants");
const { hashPassword } = require("../../../shared/utils/password");
const { sendWelcomeEmail } = require("../../../shared/utils/mailer");
const { ActivityService } = require("../../activity/services/activity.service");
const { AccessService } = require("../../access/services/access.service");
const { AccessRepository } = require("../../access/repositories/access.repository");
const { roleKeyForLegacyUser } = require("../../access/catalog/permissions.catalog");
const { hasWildcard } = require("../../../shared/access/can");
const { env } = require("../../../config/env");

class UserService {
  static Instance = new UserService();

  constructor(
    userRepo = UserRepository.Instance,
    accessService = AccessService.Instance,
    accessRepo = AccessRepository.Instance
  ) {
    this.userRepo = userRepo;
    this.accessService = accessService;
    this.accessRepo = accessRepo;
  }

  // `actor` is the request actor (id + resolved permissions); this loads the
  // stored row for the fields the request actor doesn't carry.
  async loadActor(actorId) {
    const actor = await this.userRepo.findById(actorId);
    if (!actor) throw new AppError("Account not found", 404);
    return actor;
  }

  // True when `user` is the account that created their organisation. The owner is
  // protected from being deactivated or demoted by other admins.
  async isOrgOwner(user) {
    if (!user?.organizationId) return false;
    const ownerId = await this.userRepo.findOrgOwnerId(user.organizationId);
    return ownerId != null && user.id === ownerId;
  }

  async fetchUsers(actor, params) {
    const stored = await this.loadActor(actor.id);
    // A super administrator's own org is never a real client company, so this is
    // deliberately scoped the same as any other admin — not the whole platform.
    const organizationId = stored.organizationId;
    const result = await this.userRepo.fetchPaginated({ ...params, organizationId });

    if (organizationId) {
      const ownerId = await this.userRepo.findOrgOwnerId(organizationId);
      result.data.forEach((u) => {
        u.isOrgOwner = ownerId != null && u.id === ownerId;
      });
    }

    // The Team screen shows each member's roles, and uses the same role list
    // the Roles & access editor does.
    await Promise.all(
      result.data.map(async (u) => {
        u.roles = await this.accessRepo.rolesForUser(u.id);
      })
    );
    return result;
  }

  async getUser(actor, id) {
    const stored = await this.loadActor(actor.id);
    const target = await this.userRepo.findById(id);
    if (!target || target.deletedAt) throw new AppError("User not found", 404);
    // A super administrator keeps cross-org lookup here only for the moderation
    // path in updateUser/deactivateUser below — there's no UI listing that
    // surfaces another org's user ids, so this isn't a "browse other companies" leak.
    if (!hasWildcard(actor) && target.organizationId !== stored.organizationId) {
      throw new AppError("You do not have access to this user", 403);
    }
    target.roles = await this.accessRepo.rolesForUser(target.id);
    return target;
  }

  async createUser(actor, data) {
    const stored = await this.loadActor(actor.id);

    const existing = await this.userRepo.findByEmail(data.email);
    if (existing) throw new AppError("An account with this email already exists", 409);

    const organizationId = stored.organizationId ?? crypto.randomUUID();
    const user = await this.userRepo.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: await hashPassword(data.password),
      role: data.role ?? UserRole.USER,
      companyName: stored.companyName,
      organizationId,
      provider: AuthProvider.LOCAL,
      isEmailVerified: true, // created by an admin — no self-verification needed
    });

    // Give the new account a role straight away. An explicit roleIds wins;
    // otherwise fall back to the built-in role their legacy role maps to, so a
    // client that hasn't been updated yet still produces a usable account.
    const roleIds = data.roleIds?.length
      ? data.roleIds
      : await this.defaultRoleIdsFor(organizationId, user.role);
    if (roleIds.length) {
      await this.accessService.setUserRoles({ ...actor, organizationId }, user.id, roleIds);
    }

    const loginUrl = `${env.appUrl}/login`;
    sendWelcomeEmail(user.email, user.firstName, data.password, loginUrl, user.organizationId).catch((err) =>
      console.error("[mailer] welcome email failed:", err.message)
    );

    ActivityService.Instance.log(stored, {
      action: "user.created",
      summary: `Added ${user.firstName} ${user.lastName}`,
      entityType: "user",
      entityId: user.id,
    });

    user.roles = await this.accessRepo.rolesForUser(user.id);
    return user;
  }

  async defaultRoleIdsFor(organizationId, legacyRole, isSupportLead = false) {
    const key = roleKeyForLegacyUser(legacyRole, isSupportLead);
    if (!key) return [];
    const role = await this.accessRepo.findRoleByKey(organizationId, key);
    return role ? [role.id] : [];
  }

  async updateUser(actor, id, data) {
    const stored = await this.loadActor(actor.id);
    const target = await this.getUser(actor, id);
    // IT supporter accounts are managed from their client company, not here.
    if (target.role === UserRole.IT_SUPPORT) {
      throw new AppError("Supporter accounts are managed under their client company", 403);
    }
    if (id === actor.id && data.role && data.role !== target.role) {
      throw new AppError("You cannot change your own role", 400);
    }

    // The organisation owner's details can only be edited by the owner
    // themselves or a super administrator — never by another org admin.
    if (id !== actor.id && !hasWildcard(actor) && (await this.isOrgOwner(target))) {
      throw new AppError("You cannot edit the organisation owner", 403);
    }

    const patch = {};
    if (data.firstName !== undefined) patch.firstName = data.firstName;
    if (data.lastName !== undefined) patch.lastName = data.lastName;
    if (data.role !== undefined) patch.role = data.role;
    const updated = await this.userRepo.update(target.id, patch);

    // Keep the legacy column and the role assignment in step while both exist,
    // so an account edited through the old Team form doesn't end up with a role
    // set that contradicts users.role.
    if (data.role !== undefined && data.role !== target.role) {
      const roleIds = await this.defaultRoleIdsFor(stored.organizationId, data.role);
      if (roleIds.length) {
        await this.accessService.setUserRoles(actor, target.id, roleIds);
      }
    }

    updated.roles = await this.accessRepo.rolesForUser(target.id);
    return updated;
  }

  // Role assignment proper — the Roles & access path. Guards (lockout, no
  // escalation, locked super role) live in AccessService.
  async setRoles(actor, id, roleIds) {
    const target = await this.getUser(actor, id);
    if (target.role === UserRole.IT_SUPPORT) {
      throw new AppError("Supporter accounts are managed under their client company", 403);
    }
    return this.accessService.setUserRoles(actor, target.id, roleIds);
  }

  async deactivateUser(actor, id) {
    if (id === actor.id) {
      throw new AppError("You cannot deactivate your own account", 400);
    }
    const target = await this.getUser(actor, id);
    // IT supporter accounts are managed from their client company, not here.
    if (target.role === UserRole.IT_SUPPORT) {
      throw new AppError("Supporter accounts are managed under their client company", 403);
    }

    // The account that created the organisation can never be blocked by another
    // admin — only a super administrator may (for moderation).
    if (!hasWildcard(actor) && (await this.isOrgOwner(target))) {
      throw new AppError("You cannot deactivate the organisation owner", 403);
    }

    // Removing the last person who can manage roles would lock the whole
    // organisation out of its own access control.
    await this.accessService.assertUserRemovable(actor, target.id);

    await this.userRepo.softDelete(target.id);
  }
}

module.exports = { UserService };

// modules/access/services/access.service.js
// Roles & access: the catalog, role CRUD, and role assignment.
//
// Every write here is guarded twice — once by the route's requirePermission,
// and once by the rules in this file, which are the ones that actually matter:
// lockout protection, organisation isolation, and the no-escalation rule.
// Every write is audited.
const { AccessRepository } = require("../repositories/access.repository");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { hasWildcard, can } = require("../../../shared/access/can");
const cache = require("../../../shared/access/permissionCache");
const { WILDCARD } = require("../catalog/permissions.catalog");

// The permission that can grant every other one. Losing the last holder of it
// locks an organisation out of its own access control permanently.
const GRANTING_PERMISSION = "role.manage";

class AccessService {
  static Instance = new AccessService();

  constructor(repo = AccessRepository.Instance, activity = ActivityService.Instance) {
    this.repo = repo;
    this.activity = activity;
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async fetchCatalog() {
    return this.repo.fetchCatalog();
  }

  async fetchRoles(actor) {
    if (!actor.organizationId) return [];
    return this.repo.fetchRolesForOrg(actor.organizationId);
  }

  async getRole(actor, id) {
    const role = await this.assertVisibleRole(actor, id);
    const [permissions, memberCount] = await Promise.all([
      this.repo.permissionsForRole(role.id),
      this.repo.countMembers(role.id),
    ]);
    return { ...role, permissions, permissionCount: permissions.length, memberCount };
  }

  // ── Guards ─────────────────────────────────────────────────────────────────

  // A role is visible to an actor if it belongs to their organisation, or is
  // the platform-level role (which everyone can see and nobody can edit).
  async assertVisibleRole(actor, id) {
    const role = await this.repo.findRoleById(id);
    if (!role) throw new AppError("Role not found", 404);
    if (role.organizationId !== null && role.organizationId !== actor.organizationId) {
      // Don't disclose that a role exists in another organisation.
      throw new AppError("Role not found", 404);
    }
    return role;
  }

  assertEditable(role) {
    if (role.isLocked) {
      throw new AppError(
        "This role is locked and cannot be changed",
        403
      );
    }
  }

  // Sanity-check the codes against the catalog so a typo can't create a
  // permission that no route will ever check (and that nobody can revoke).
  async assertKnownPermissions(codes) {
    if (codes.includes(WILDCARD)) {
      throw new AppError("The wildcard permission cannot be granted to a role", 400);
    }
    const valid = await this.repo.validPermissionCodes(codes);
    const unknown = codes.filter((c) => !valid.includes(c));
    if (unknown.length) {
      throw new AppError(`Unknown permission: ${unknown.join(", ")}`, 400);
    }
  }

  // Because role.manage can grant anything, a non-super administrator must not
  // be able to bootstrap themselves past their own ceiling by writing a role.
  assertNoEscalation(actor, codes) {
    if (hasWildcard(actor)) return;
    const beyond = codes.filter((code) => !can(actor, code));
    if (beyond.length) {
      throw new AppError(
        `You cannot grant permissions you do not hold yourself: ${beyond.join(", ")}`,
        403
      );
    }
  }

  // Refuse any change that would leave the organisation with no role able to
  // manage roles, or no user holding such a role.
  async assertGrantingPermissionSurvives(actor, roleId, nextCodes) {
    const stillGrants = nextCodes.includes(GRANTING_PERMISSION);
    if (stillGrants) return;

    const granting = await this.repo.roleIdsGranting(
      actor.organizationId,
      GRANTING_PERMISSION
    );
    const others = granting.filter((id) => id !== roleId);
    if (!others.length) {
      throw new AppError(
        "This is the last role that can manage roles — removing that permission would lock everyone out",
        409
      );
    }
  }

  // ── Role writes ────────────────────────────────────────────────────────────

  async createRole(actor, { name, description, permissions = [], cloneFromId }) {
    if (!actor.organizationId) {
      throw new AppError("No organisation on this account", 403);
    }

    let codes = permissions;
    if (cloneFromId) {
      const source = await this.assertVisibleRole(actor, cloneFromId);
      const sourceCodes = await this.repo.permissionsForRole(source.id);
      // Cloning the locked super role would mint a second wildcard holder.
      codes = sourceCodes.filter((c) => c !== WILDCARD);
    }

    const trimmed = name.trim();
    const clash = await this.repo.findRoleByName(actor.organizationId, trimmed);
    if (clash) throw new AppError("A role with that name already exists", 409);

    await this.assertKnownPermissions(codes);
    this.assertNoEscalation(actor, codes);

    const role = await this.repo.createRole({
      organizationId: actor.organizationId,
      key: null, // custom roles have no seed key
      name: trimmed,
      description: description?.trim() || null,
      isBuiltin: false,
      isLocked: false,
    });
    await this.repo.setRolePermissions(role.id, codes);
    cache.invalidateAll();

    this.activity.log(actor, {
      action: "role.created",
      entityType: "role",
      entityId: role.id,
      summary: `Created role "${role.name}"`,
      metadata: { before: null, after: { name: role.name, permissions: codes } },
    });

    return { ...role, permissions: codes, permissionCount: codes.length, memberCount: 0 };
  }

  async updateRole(actor, id, { name, description, permissions }) {
    const role = await this.assertVisibleRole(actor, id);
    this.assertEditable(role);

    const before = {
      name: role.name,
      description: role.description,
      permissions: await this.repo.permissionsForRole(role.id),
    };

    const patch = {};

    if (name !== undefined) {
      // A built-in role's name is fixed; its permission set is not.
      if (role.isBuiltin && name.trim() !== role.name) {
        throw new AppError("A built-in role's name cannot be changed", 400);
      }
      const trimmed = name.trim();
      if (trimmed !== role.name) {
        const clash = await this.repo.findRoleByName(actor.organizationId, trimmed);
        if (clash && clash.id !== role.id) {
          throw new AppError("A role with that name already exists", 409);
        }
        patch.name = trimmed;
      }
    }
    if (description !== undefined) {
      patch.description = description?.trim() || null;
    }

    if (permissions !== undefined) {
      await this.assertKnownPermissions(permissions);
      this.assertNoEscalation(actor, permissions);
      await this.assertGrantingPermissionSurvives(actor, role.id, permissions);
      // Removing role.manage from a role can orphan its members' ability to
      // manage access even when another role still grants it, so check holders too.
      await this.assertGrantingHoldersSurvive(actor, role.id, permissions, before.permissions);
    }

    if (Object.keys(patch).length) {
      await this.repo.updateRole(role.id, patch);
    }
    if (permissions !== undefined) {
      await this.repo.setRolePermissions(role.id, permissions);
    }
    cache.invalidateAll();

    const after = {
      name: patch.name ?? role.name,
      description: patch.description ?? role.description,
      permissions: permissions ?? before.permissions,
    };

    this.activity.log(actor, {
      action: permissions !== undefined ? "role.permissions_changed" : "role.updated",
      entityType: "role",
      entityId: role.id,
      summary: `Updated role "${after.name}"`,
      metadata: { before, after },
    });

    return this.getRole(actor, role.id);
  }

  // If this role currently grants role.manage and is about to stop, every one
  // of its members must still hold role.manage through some other role.
  async assertGrantingHoldersSurvive(actor, roleId, nextCodes, previousCodes) {
    const wasGranting = previousCodes.includes(GRANTING_PERMISSION);
    const willGrant = nextCodes.includes(GRANTING_PERMISSION);
    if (!wasGranting || willGrant) return;

    const holders = await this.repo.userIdsWithPermission(
      actor.organizationId,
      GRANTING_PERMISSION
    );
    const grantingRoles = await this.repo.roleIdsGranting(
      actor.organizationId,
      GRANTING_PERMISSION
    );
    const otherGrantingRoles = grantingRoles.filter((r) => r !== roleId);
    if (!otherGrantingRoles.length && holders.length) {
      throw new AppError(
        "Removing this permission would leave nobody able to manage roles",
        409
      );
    }
  }

  async deleteRole(actor, id) {
    const role = await this.assertVisibleRole(actor, id);
    this.assertEditable(role);
    if (role.isBuiltin) {
      throw new AppError("A built-in role cannot be deleted", 400);
    }

    const memberCount = await this.repo.countMembers(role.id);
    if (memberCount > 0) {
      throw new AppError(
        `This role still has ${memberCount} member${memberCount === 1 ? "" : "s"} — reassign them first`,
        409
      );
    }

    const permissions = await this.repo.permissionsForRole(role.id);
    await this.assertGrantingPermissionSurvives(actor, role.id, []);
    await this.repo.deleteRole(role.id);
    cache.invalidateAll();

    this.activity.log(actor, {
      action: "role.deleted",
      entityType: "role",
      entityId: role.id,
      summary: `Deleted role "${role.name}"`,
      metadata: { before: { name: role.name, permissions }, after: null },
    });
  }

  // ── Assignment ─────────────────────────────────────────────────────────────

  async setUserRoles(actor, userId, roleIds) {
    const roles = [];
    for (const id of roleIds) {
      const role = await this.assertVisibleRole(actor, id);
      // Only a super administrator can hand out the locked super role.
      if (role.isLocked && !hasWildcard(actor)) {
        throw new AppError("Only a super administrator can grant that role", 403);
      }
      roles.push(role);
    }

    // No escalation: assigning a role is granting every permission in it.
    const granted = new Set();
    for (const role of roles) {
      for (const code of await this.repo.permissionsForRole(role.id)) {
        granted.add(code);
      }
    }
    if (!hasWildcard(actor)) {
      this.assertNoEscalation(actor, [...granted].filter((c) => c !== WILDCARD));
    }

    const beforeRoles = await this.repo.rolesForUser(userId);
    await this.assertLockoutOnAssignment(actor, userId, granted, beforeRoles);

    await this.repo.setUserRoles(userId, roleIds, actor.id);
    cache.invalidate(userId);
    cache.invalidateAll();

    this.activity.log(actor, {
      action: "role.assigned",
      entityType: "user",
      entityId: userId,
      summary: `Changed roles for a team member`,
      metadata: {
        before: beforeRoles.map((r) => ({ id: r.id, name: r.name })),
        after: roles.map((r) => ({ id: r.id, name: r.name })),
      },
    });

    return this.repo.rolesForUser(userId);
  }

  // Never let the last person who can manage roles, or the last super
  // administrator, be stripped of that power — including by themselves.
  async assertLockoutOnAssignment(actor, userId, nextPermissions, beforeRoles) {
    const hadGranting = await this.userHasPermission(beforeRoles, GRANTING_PERMISSION);
    const willHaveGranting =
      nextPermissions.has(GRANTING_PERMISSION) || nextPermissions.has(WILDCARD);

    if (hadGranting && !willHaveGranting) {
      const holders = await this.repo.userIdsWithPermission(
        actor.organizationId,
        GRANTING_PERMISSION
      );
      const remaining = holders.filter((id) => id !== userId);
      if (!remaining.length) {
        throw new AppError(
          userId === actor.id
            ? "You are the last person who can manage roles — give someone else that permission first"
            : "This is the last person who can manage roles — give someone else that permission first",
          409
        );
      }
    }

    const wasSuper = beforeRoles.some((r) => r.isLocked);
    const willBeSuper = nextPermissions.has(WILDCARD);
    if (wasSuper && !willBeSuper) {
      const supers = await this.repo.superAdminUserIds();
      const remaining = supers.filter((id) => id !== userId);
      if (!remaining.length) {
        throw new AppError("The last super administrator cannot be removed", 409);
      }
    }
  }

  async userHasPermission(roles, code) {
    for (const role of roles) {
      const codes = await this.repo.permissionsForRole(role.id);
      if (codes.includes(code) || codes.includes(WILDCARD)) return true;
    }
    return false;
  }

  // Called before a user is deleted — same lockout rules as unassignment.
  async assertUserRemovable(actor, userId) {
    const roles = await this.repo.rolesForUser(userId);
    await this.assertLockoutOnAssignment(actor, userId, new Set(), roles);
  }

  async rolesForUser(userId) {
    return this.repo.rolesForUser(userId);
  }
}

module.exports = { AccessService, GRANTING_PERMISSION };

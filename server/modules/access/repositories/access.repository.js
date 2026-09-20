// modules/access/repositories/access.repository.js
// Every read and write of the role model. The resolver's hot path
// (effectivePermissions) is a single indexed join, run once per request and
// then cached for a few seconds by permissionCache.js.
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { Role } = require("../entities/role.entity");
const { Permission } = require("../entities/permission.entity");
const { PermissionCategory } = require("../entities/permissionCategory.entity");
const { RolePermission } = require("../entities/rolePermission.entity");
const { UserRoleAssignment } = require("../entities/userRole.entity");

class AccessRepository {
  static Instance = new AccessRepository();

  constructor() {
    this.roles = AppDataSource.getRepository(Role);
    this.permissions = AppDataSource.getRepository(Permission);
    this.categories = AppDataSource.getRepository(PermissionCategory);
    this.rolePermissions = AppDataSource.getRepository(RolePermission);
    this.userRoles = AppDataSource.getRepository(UserRoleAssignment);
  }

  // ── Resolver hot path ──────────────────────────────────────────────────────

  // The union of every permission code granted by every role the user holds.
  async effectivePermissions(userId) {
    const rows = await this.userRoles
      .createQueryBuilder("ur")
      .innerJoin("role_permissions", "rp", "rp.role_id = ur.role_id")
      .select("DISTINCT rp.permission_code", "code")
      .where("ur.user_id = :userId", { userId })
      .getRawMany();
    return rows.map((r) => r.code);
  }

  async rolesForUser(userId) {
    return this.roles
      .createQueryBuilder("r")
      .innerJoin("user_roles", "ur", "ur.role_id = r.id")
      .where("ur.user_id = :userId", { userId })
      .orderBy("r.name", "ASC")
      .getMany();
  }

  // ── Catalog ────────────────────────────────────────────────────────────────

  async fetchCatalog() {
    const [categories, permissions] = await Promise.all([
      this.categories.find({ order: { sortOrder: "ASC" } }),
      this.permissions.find({ order: { sortOrder: "ASC" } }),
    ]);
    // 'system' holds the wildcard, which has no category card and is never
    // offered as a checkbox.
    return {
      categories,
      permissions: permissions.filter((p) => p.category !== "system"),
    };
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  // An organisation's own roles. The platform-level super-administrator role
  // (organization_id IS NULL) belongs to the vendor, so it is included only
  // when the caller asks for it — see AccessService.fetchRoles.
  async fetchRolesForOrg(organizationId, { includePlatform = false } = {}) {
    const query = this.roles
      .createQueryBuilder("r")
      .where("r.organization_id = :organizationId", { organizationId });
    if (includePlatform) query.orWhere("r.organization_id IS NULL");
    const roles = await query
      .orderBy("r.is_locked", "DESC")
      .addOrderBy("r.is_builtin", "DESC")
      .addOrderBy("r.name", "ASC")
      .getMany();

    if (!roles.length) return [];
    const ids = roles.map((r) => r.id);

    const [permCounts, memberCounts, permRows] = await Promise.all([
      this.rolePermissions
        .createQueryBuilder("rp")
        .select("rp.role_id", "roleId")
        .addSelect("COUNT(*)", "count")
        .where("rp.role_id IN (:...ids)", { ids })
        .groupBy("rp.role_id")
        .getRawMany(),
      this.userRoles
        .createQueryBuilder("ur")
        .select("ur.role_id", "roleId")
        .addSelect("COUNT(*)", "count")
        .where("ur.role_id IN (:...ids)", { ids })
        .groupBy("ur.role_id")
        .getRawMany(),
      this.rolePermissions
        .createQueryBuilder("rp")
        .select(["rp.role_id AS \"roleId\"", "rp.permission_code AS \"code\""])
        .where("rp.role_id IN (:...ids)", { ids })
        .getRawMany(),
    ]);

    const perms = new Map(permCounts.map((r) => [r.roleId, Number(r.count)]));
    const members = new Map(memberCounts.map((r) => [r.roleId, Number(r.count)]));
    const codes = new Map();
    for (const row of permRows) {
      if (!codes.has(row.roleId)) codes.set(row.roleId, []);
      codes.get(row.roleId).push(row.code);
    }

    return roles.map((r) => ({
      ...r,
      permissions: codes.get(r.id) ?? [],
      permissionCount: perms.get(r.id) ?? 0,
      memberCount: members.get(r.id) ?? 0,
    }));
  }

  async findRoleById(id) {
    return this.roles.findOne({ where: { id } });
  }

  async findRoleByKey(organizationId, key) {
    return this.roles.findOne({ where: { organizationId, key } });
  }

  async findRoleByName(organizationId, name) {
    return this.roles
      .createQueryBuilder("r")
      .where("r.organization_id = :organizationId", { organizationId })
      .andWhere("LOWER(r.name) = LOWER(:name)", { name })
      .getOne();
  }

  async permissionsForRole(roleId) {
    const rows = await this.rolePermissions.find({ where: { roleId } });
    return rows.map((r) => r.permissionCode);
  }

  async createRole(data) {
    return this.roles.save(this.roles.create(data));
  }

  async updateRole(id, patch) {
    await this.roles.update(id, patch);
    return this.findRoleById(id);
  }

  async deleteRole(id) {
    await this.roles.delete(id);
  }

  async setRolePermissions(roleId, codes) {
    await AppDataSource.transaction(async (manager) => {
      await manager.delete(RolePermission, { roleId });
      if (codes.length) {
        await manager.insert(
          RolePermission,
          codes.map((permissionCode) => ({ roleId, permissionCode }))
        );
      }
    });
  }

  async countMembers(roleId) {
    return this.userRoles.count({ where: { roleId } });
  }

  async validPermissionCodes(codes) {
    if (!codes.length) return [];
    const rows = await this.permissions
      .createQueryBuilder("p")
      .select("p.code", "code")
      .where("p.code IN (:...codes)", { codes })
      .getRawMany();
    return rows.map((r) => r.code);
  }

  // ── Assignment ─────────────────────────────────────────────────────────────

  async setUserRoles(userId, roleIds, grantedBy) {
    await AppDataSource.transaction(async (manager) => {
      await manager.delete(UserRoleAssignment, { userId });
      if (roleIds.length) {
        await manager.insert(
          UserRoleAssignment,
          roleIds.map((roleId) => ({ userId, roleId, grantedBy: grantedBy ?? null }))
        );
      }
    });
  }

  // ── Lockout guards ─────────────────────────────────────────────────────────

  // Roles in this organisation (plus the platform role) that grant `code`,
  // either directly or via the wildcard.
  async roleIdsGranting(organizationId, code) {
    const rows = await this.roles
      .createQueryBuilder("r")
      .innerJoin("role_permissions", "rp", "rp.role_id = r.id")
      .select("DISTINCT r.id", "id")
      .where("(r.organization_id = :organizationId OR r.organization_id IS NULL)", {
        organizationId,
      })
      .andWhere("rp.permission_code IN (:...codes)", { codes: [code, "*"] })
      .getRawMany();
    return rows.map((r) => r.id);
  }

  // Distinct user ids in this organisation holding any role that grants `code`.
  async userIdsWithPermission(organizationId, code) {
    const rows = await this.userRoles
      .createQueryBuilder("ur")
      .innerJoin("roles", "r", "r.id = ur.role_id")
      .innerJoin("role_permissions", "rp", "rp.role_id = r.id")
      .innerJoin("users", "u", "u.id = ur.user_id AND u.deleted_at IS NULL")
      .select("DISTINCT ur.user_id", "userId")
      .where("u.organization_id = :organizationId", { organizationId })
      .andWhere("rp.permission_code IN (:...codes)", { codes: [code, "*"] })
      .getRawMany();
    return rows.map((r) => r.userId);
  }

  // Holders of the locked super-administrator role, platform-wide.
  async superAdminUserIds() {
    const rows = await this.userRoles
      .createQueryBuilder("ur")
      .innerJoin("roles", "r", "r.id = ur.role_id")
      .innerJoin("users", "u", "u.id = ur.user_id AND u.deleted_at IS NULL")
      .select("DISTINCT ur.user_id", "userId")
      .where("r.is_locked = true")
      .getRawMany();
    return rows.map((r) => r.userId);
  }
}

module.exports = { AccessRepository };

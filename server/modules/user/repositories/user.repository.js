// modules/user/repositories/user.repository.js
// Data access for company member management. Reuses the User entity.
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { User } = require("../../auth/entities/user.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class UserRepository {
  static Instance = new UserRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(User);
  }

  // organizationId omitted => unscoped (superadmin view).
  // IT supporters (external client-company staff) never appear in team lists —
  // they're managed from their client company, not the org's Team page.
  async fetchPaginated({ organizationId, page = 1, limit = 20, search }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("u")
      .where("u.deleted_at IS NULL")
      .andWhere("u.role != 'it_support'")
      .orderBy("u.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (organizationId) {
      qb.andWhere("u.organization_id = :organizationId", { organizationId });
    }
    if (search) {
      qb.andWhere(
        "(u.first_name ILIKE :s OR u.last_name ILIKE :s OR u.email ILIKE :s)",
        { s: `%${search}%` }
      );
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({ where: { id } });
  }

  // The organisation's owner = the account that created it, i.e. the earliest-created
  // user in the org (the admin who registered; members are created afterwards).
  // Includes soft-deleted rows so the owner's identity stays stable. Returns the id.
  async findOrgOwnerId(organizationId) {
    if (!organizationId) return null;
    const row = await this.repo
      .createQueryBuilder("u")
      .select("u.id", "id")
      .where("u.organization_id = :organizationId", { organizationId })
      .orderBy("u.created_at", "ASC")
      .addOrderBy("u.id", "ASC")
      .withDeleted()
      .limit(1)
      .getRawOne();
    return row ? row.id : null;
  }

  // Same "earliest-created user in the org" rule as findOrgOwnerId, but
  // returns the email directly in one query — used to address branded email
  // footers to a stable, real contact at the company rather than the app's
  // own SMTP relay mailbox.
  async findOrgOwner(organizationId) {
    if (!organizationId) return null;
    const row = await this.repo
      .createQueryBuilder("u")
      .select(["u.id", "u.email"])
      .where("u.organization_id = :organizationId", { organizationId })
      .orderBy("u.created_at", "ASC")
      .addOrderBy("u.id", "ASC")
      .withDeleted()
      .limit(1)
      .getOne();
    return row ? { id: row.id, email: row.email } : null;
  }

  async findByEmail(email) {
    return this.repo.findOne({ where: { email } });
  }

  // ── Client-company supporters (it_support accounts) ─────────────────────────
  async findByClientCompany(clientCompanyId) {
    return this.repo.find({
      where: { clientCompanyId }, // indexed
      order: { createdAt: "ASC" },
      select: ["id", "firstName", "lastName", "email", "createdAt", "lastSeenAt", "isSupportLead"],
    });
  }

  async countByClientCompany(clientCompanyId) {
    return this.repo.count({ where: { clientCompanyId } });
  }

  // Cross-org overview for the superadmin's /platform page. There's no
  // Organization table — this groups users by organization_id and, per group,
  // joins the earliest-created member (the "owner", same rule as
  // findOrgOwnerId) so the caller has a name/email to show for the org.
  async listOrganizations({ page = 1, limit = 20, search } = {}) {
    const offset = getOffset(page, limit);
    const ds = this.repo.manager.connection;

    const params = [];
    let searchClause = "";
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      searchClause = `WHERE (owner.company_name ILIKE ${p} OR owner.email ILIKE ${p} OR owner.first_name ILIKE ${p} OR owner.last_name ILIKE ${p})`;
    }

    const fromClause = `
      FROM (
        SELECT organization_id, COUNT(*)::int AS user_count, MIN(created_at) AS created_at
        FROM users
        WHERE deleted_at IS NULL AND organization_id IS NOT NULL
        GROUP BY organization_id
      ) org
      JOIN LATERAL (
        SELECT id, email, first_name, last_name, company_name
        FROM users u2
        WHERE u2.organization_id = org.organization_id
        ORDER BY u2.created_at ASC, u2.id ASC
        LIMIT 1
      ) owner ON true
      ${searchClause}
    `;

    let total = 0;
    if (page === 1) {
      const [{ count }] = await ds.query(`SELECT COUNT(*)::int AS count ${fromClause}`, params);
      total = count;
    }

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rows = await ds.query(
      `
      SELECT
        org.organization_id,
        org.user_count,
        org.created_at,
        owner.id AS owner_id,
        owner.email AS owner_email,
        owner.first_name AS owner_first_name,
        owner.last_name AS owner_last_name,
        owner.company_name AS company_name
      ${fromClause}
      ORDER BY org.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      [...params, limit, offset]
    );

    return { rows, total };
  }

  async create(data) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id, data) {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id) {
    await this.repo.softDelete(id);
  }

  // Called when a user's last realtime connection drops (see socketServer.js).
  async touchLastSeen(id) {
    await this.repo.update(id, { lastSeenAt: new Date() });
  }
}

module.exports = { UserRepository };

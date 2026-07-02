// modules/featureRequest/repositories/featureRequest.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { FeatureRequest } = require("../entities/featureRequest.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class FeatureRequestRepository {
  static Instance = new FeatureRequestRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(FeatureRequest);
  }

  // Platform-wide — no organizationId filter. sort: "top" (default) | "newest".
  async fetchPaginated({ page = 1, limit = 20, status, category, search, sort = "top" }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("fr")
      .leftJoinAndSelect("fr.submittedBy", "submittedBy")
      .where("fr.deleted_at IS NULL")
      .skip(offset)
      .take(limit);

    if (status) qb.andWhere("fr.status = :status", { status });
    if (category) qb.andWhere("fr.category = :category", { category });
    if (search) qb.andWhere("fr.title ILIKE :search", { search: `%${search}%` });

    if (sort === "newest") {
      qb.orderBy("fr.createdAt", "DESC");
    } else {
      qb.orderBy("fr.upvoteCount", "DESC").addOrderBy("fr.createdAt", "DESC");
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({ where: { id }, relations: { submittedBy: true } });
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

  // Batch comment counts — avoids N+1 when annotating a list page.
  async commentCounts(featureRequestIds) {
    if (!featureRequestIds.length) return new Map();
    const ds = this.repo.manager.connection;
    const rows = await ds.query(
      `SELECT feature_request_id, COUNT(*)::int AS count FROM feature_request_comments
       WHERE feature_request_id = ANY($1::uuid[]) AND deleted_at IS NULL
       GROUP BY feature_request_id`,
      [featureRequestIds]
    );
    return new Map(rows.map((r) => [r.feature_request_id, r.count]));
  }
}

module.exports = { FeatureRequestRepository };

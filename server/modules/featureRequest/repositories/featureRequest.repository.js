// modules/featureRequest/repositories/featureRequest.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { FeatureRequest } = require("../entities/featureRequest.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class FeatureRequestRepository {
  static Instance = new FeatureRequestRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(FeatureRequest);
  }

  // sort: "top" (default) | "newest".
  async fetchPaginated({ projectId, page = 1, limit = 20, status, category, search, sort = "top" }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("fr")
      .leftJoinAndSelect("fr.submittedBy", "submittedBy")
      .where("fr.project_id = :projectId", { projectId }) // indexed FK
      .andWhere("fr.deleted_at IS NULL")
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

  // Denormalized — comments live in Firestore, so there's no local table to COUNT.
  // Called by the service after each successful Firestore comment write/soft-delete.
  async incrementCommentCount(id) {
    await this.repo.increment({ id }, "commentCount", 1);
  }

  async decrementCommentCount(id) {
    await this.repo.decrement({ id }, "commentCount", 1);
  }
}

module.exports = { FeatureRequestRepository };

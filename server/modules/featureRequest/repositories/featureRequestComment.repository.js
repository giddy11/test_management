// modules/featureRequest/repositories/featureRequestComment.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { FeatureRequestComment } = require("../entities/featureRequestComment.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class FeatureRequestCommentRepository {
  static Instance = new FeatureRequestCommentRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(FeatureRequestComment);
  }

  async fetchPaginated(featureRequestId, { page = 1, limit = 20 }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.author", "author")
      .where("c.feature_request_id = :featureRequestId", { featureRequestId }) // indexed
      .andWhere("c.deleted_at IS NULL")
      .orderBy("c.createdAt", "ASC")
      .skip(offset)
      .take(limit);

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({ where: { id } });
  }

  async create(data) {
    return this.repo.save(this.repo.create(data));
  }

  async softDelete(id) {
    await this.repo.softDelete(id);
  }
}

module.exports = { FeatureRequestCommentRepository };

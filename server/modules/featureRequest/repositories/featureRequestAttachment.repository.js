// modules/featureRequest/repositories/featureRequestAttachment.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const {
  FeatureRequestAttachment,
} = require("../entities/featureRequestAttachment.entity");

class FeatureRequestAttachmentRepository {
  static Instance = new FeatureRequestAttachmentRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(FeatureRequestAttachment);
  }

  async findByFeatureRequest(featureRequestId) {
    return this.repo
      .createQueryBuilder("att")
      .where("att.feature_request_id = :featureRequestId", { featureRequestId }) // indexed FK
      .orderBy("att.createdAt", "DESC")
      .getMany();
  }

  async countByFeatureRequest(featureRequestId) {
    return this.repo.count({ where: { featureRequestId } });
  }

  async findById(id) {
    return this.repo.findOne({ where: { id } });
  }

  async createMany(rows) {
    if (!rows.length) return [];
    return this.repo.save(this.repo.create(rows));
  }

  async delete(id) {
    await this.repo.delete(id);
  }
}

module.exports = { FeatureRequestAttachmentRepository };

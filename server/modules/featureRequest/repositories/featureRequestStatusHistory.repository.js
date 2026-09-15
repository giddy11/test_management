// modules/featureRequest/repositories/featureRequestStatusHistory.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { FeatureRequestStatusHistory } = require("../entities/featureRequestStatusHistory.entity");

class FeatureRequestStatusHistoryRepository {
  static Instance = new FeatureRequestStatusHistoryRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(FeatureRequestStatusHistory);
  }

  async create(entry) {
    await this.repo.save(this.repo.create(entry));
  }

  // Ordered oldest → newest — the shape a timeline renders directly.
  async findByFeatureRequest(featureRequestId) {
    return this.repo.find({
      where: { featureRequestId },
      order: { enteredAt: "ASC" },
      select: ["id", "status", "enteredAt"],
    });
  }
}

module.exports = { FeatureRequestStatusHistoryRepository };

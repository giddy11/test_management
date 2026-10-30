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

  // Ordered oldest → newest — the shape a timeline renders directly. Only the
  // actor's name fields are loaded, not the whole user row.
  async findByFeatureRequest(featureRequestId) {
    return this.repo.find({
      where: { featureRequestId },
      order: { enteredAt: "ASC" },
      relations: { actor: true },
      select: {
        id: true,
        status: true,
        enteredAt: true,
        actor: { id: true, firstName: true, lastName: true },
      },
    });
  }
}

module.exports = { FeatureRequestStatusHistoryRepository };

// modules/bug/repositories/bugStatusHistory.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { BugStatusHistory } = require("../entities/bugStatusHistory.entity");

class BugStatusHistoryRepository {
  static Instance = new BugStatusHistoryRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(BugStatusHistory);
  }

  async create(entry) {
    await this.repo.save(this.repo.create(entry));
  }

  // Ordered oldest → newest — the shape a timeline renders directly. Only the
  // actor's name fields are loaded, not the whole user row.
  async findByBug(bugId) {
    return this.repo.find({
      where: { bugId },
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

module.exports = { BugStatusHistoryRepository };

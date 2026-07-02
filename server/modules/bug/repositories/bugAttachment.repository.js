// modules/bug/repositories/bugAttachment.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { BugAttachment } = require("../entities/bugAttachment.entity");

class BugAttachmentRepository {
  static Instance = new BugAttachmentRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(BugAttachment);
  }

  async findByBug(bugId) {
    return this.repo
      .createQueryBuilder("att")
      .where("att.bug_id = :bugId", { bugId }) // indexed FK
      .orderBy("att.createdAt", "DESC")
      .getMany();
  }

  async countByBug(bugId) {
    return this.repo.count({ where: { bugId } });
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

module.exports = { BugAttachmentRepository };

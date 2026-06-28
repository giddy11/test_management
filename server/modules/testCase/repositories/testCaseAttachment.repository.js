// modules/testCase/repositories/testCaseAttachment.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const {
  TestCaseAttachment,
} = require("../entities/testCaseAttachment.entity");

class TestCaseAttachmentRepository {
  static Instance = new TestCaseAttachmentRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(TestCaseAttachment);
  }

  async findByTestCase(testCaseId) {
    return this.repo
      .createQueryBuilder("att")
      .where("att.test_case_id = :testCaseId", { testCaseId }) // indexed FK
      .orderBy("att.created_at", "DESC")
      .getMany();
  }

  async findById(id) {
    return this.repo.findOne({ where: { id } });
  }

  async countByTestCase(testCaseId) {
    return this.repo.count({ where: { testCaseId } });
  }

  async create(data) {
    return this.repo.save(this.repo.create(data));
  }

  async createMany(rows) {
    if (!rows.length) return [];
    return this.repo.save(this.repo.create(rows));
  }

  async delete(id) {
    await this.repo.delete(id);
  }
}

module.exports = { TestCaseAttachmentRepository };

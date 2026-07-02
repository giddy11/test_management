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
      .orderBy("att.createdAt", "DESC")
      .getMany();
  }

  // Batch fetch across many cases at once — used by export to avoid N+1 queries.
  async findByTestCaseIds(testCaseIds) {
    if (!testCaseIds || testCaseIds.length === 0) return [];
    return this.repo
      .createQueryBuilder("att")
      .where("att.test_case_id = ANY(:testCaseIds::uuid[])", { testCaseIds })
      .orderBy("att.createdAt", "ASC")
      .getMany();
  }

  async findByRunResult(runResultId) {
    return this.repo
      .createQueryBuilder("att")
      .where("att.run_result_id = :runResultId", { runResultId })
      .orderBy("att.createdAt", "DESC")
      .getMany();
  }

  async countByRunResult(runResultId) {
    return this.repo.count({ where: { runResultId } });
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

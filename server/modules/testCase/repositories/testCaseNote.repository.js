// modules/testCase/repositories/testCaseNote.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { TestCaseNote } = require("../entities/testCaseNote.entity");
const { TestRunResult } = require("../../testRunResult/entities/testRunResult.entity");

class TestCaseNoteRepository {
  static Instance = new TestCaseNoteRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(TestCaseNote);
    this.resultRepo = AppDataSource.getRepository(TestRunResult);
  }

  // Newest first — the thread reads top-down like a comment feed.
  async findByTestCase(testCaseId) {
    return this.repo
      .createQueryBuilder("note")
      .leftJoin("note.author", "author")
      .addSelect(["author.id", "author.firstName", "author.lastName", "author.email"])
      .where("note.test_case_id = :testCaseId", { testCaseId }) // indexed FK
      .orderBy("note.createdAt", "DESC")
      .getMany();
  }

  async findById(id) {
    return this.repo.findOne({ where: { id } });
  }

  async countByTestCase(testCaseId) {
    return this.repo.count({ where: { testCaseId } });
  }

  async create(data) {
    const saved = await this.repo.save(this.repo.create(data));
    // Re-read through the author join so the response carries the same shape
    // as the list endpoint (the client renders the new note straight away).
    return this.repo
      .createQueryBuilder("note")
      .leftJoin("note.author", "author")
      .addSelect(["author.id", "author.firstName", "author.lastName", "author.email"])
      .where("note.id = :id", { id: saved.id })
      .getOne();
  }

  async delete(id) {
    await this.repo.delete(id);
  }

  // Notes recorded against this case while executing runs — read-only history
  // that lives on test_run_results, not in the thread above.
  async findRunNotes(testCaseId) {
    return this.resultRepo
      .createQueryBuilder("result")
      .leftJoin("result.run", "run")
      .leftJoin("result.executedBy", "executedBy")
      .select([
        "result.id AS id",
        "result.notes AS notes",
        "result.status AS status",
        "result.executedAt AS \"executedAt\"",
        "run.id AS \"runId\"",
        "run.name AS \"runName\"",
        "executedBy.id AS \"executedById\"",
        "executedBy.firstName AS \"firstName\"",
        "executedBy.lastName AS \"lastName\"",
        "executedBy.email AS email",
      ])
      .where("result.test_case_id = :testCaseId", { testCaseId })
      .andWhere("result.notes IS NOT NULL")
      .andWhere("result.notes <> ''")
      .orderBy("result.executedAt", "DESC", "NULLS LAST")
      .getRawMany();
  }
}

module.exports = { TestCaseNoteRepository };

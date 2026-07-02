// modules/project/repositories/project.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { Project } = require("../entities/project.entity");
const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

class ProjectRepository {
  static Instance = new ProjectRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(Project);
  }

  // organizationId omitted => unscoped (superadmin view across all companies).
  // assigneeId set => only projects this user has at least one test case assignment in
  // (used to scope the 'user' role — see ProjectService.fetchProjects).
  async fetchPaginated({ organizationId, page = 1, limit = 20, search, assigneeId }) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("project")
      .where("project.deleted_at IS NULL")
      .orderBy("project.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (organizationId) {
      qb.andWhere("project.organization_id = :organizationId", { organizationId }); // indexed
    }
    if (search) {
      qb.andWhere("project.name ILIKE :search", { search: `%${search}%` });
    }
    if (assigneeId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM test_suites ts
          JOIN test_cases tc ON tc.suite_id = ts.id AND tc.deleted_at IS NULL
          JOIN test_case_assignees tca ON tca.test_case_id = tc.id
          WHERE ts.project_id = project.id AND ts.deleted_at IS NULL AND tca.user_id = :assigneeId
        )`,
        { assigneeId }
      );
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();

    if (data.length > 0) {
      const ds = this.repo.manager.connection;
      const counts = await ds.query(
        `SELECT project_id, COUNT(*)::int AS count FROM test_suites WHERE project_id = ANY($1::uuid[]) AND deleted_at IS NULL GROUP BY project_id`,
        [data.map((p) => p.id)]
      );
      const countMap = new Map(counts.map((r) => [r.project_id, r.count]));
      data.forEach((p) => { p.suiteCount = countMap.get(p.id) ?? 0; });
    }

    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id) {
    return this.repo.findOne({ where: { id }, relations: { members: true } });
  }

  // `data.members` (if present) must be an array of `{ id }` user references.
  async create(data) {
    return this.repo.save(this.repo.create(data));
  }

  // Saves a fully-hydrated entity — used for updates that touch the members relation.
  async save(entity) {
    return this.repo.save(entity);
  }

  async softDelete(id) {
    await this.repo.softDelete(id);
  }
}

module.exports = { ProjectRepository };

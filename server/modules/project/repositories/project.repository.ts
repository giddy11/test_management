// modules/project/repositories/project.repository.ts
import type { Repository } from "typeorm";
import { Project } from "../entities/project.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

export interface FetchProjectsParams {
  organizationId?: string;
  page?: number;
  limit?: number;
  search?: string;
  // Set for the 'user' role: only projects where this user is a project member
  // OR has at least one test case assignment (see ProjectService.fetchProjects).
  restrictedUserId?: string;
}

export class ProjectRepository {
  static Instance = new ProjectRepository();

  private repo: Repository<Project>;

  constructor() {
    this.repo = AppDataSource.getRepository(Project);
  }

  // organizationId omitted => unscoped (superadmin view across all companies).
  async fetchPaginated({
    organizationId,
    page = 1,
    limit = 20,
    search,
    restrictedUserId,
  }: FetchProjectsParams) {
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
    if (restrictedUserId) {
      qb.andWhere(
        `(
          EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = project.id AND pm.user_id = :restrictedUserId
          )
          OR EXISTS (
            SELECT 1 FROM test_suites ts
            JOIN test_cases tc ON tc.suite_id = ts.id AND tc.deleted_at IS NULL
            JOIN test_case_assignees tca ON tca.test_case_id = tc.id
            WHERE ts.project_id = project.id AND ts.deleted_at IS NULL AND tca.user_id = :restrictedUserId
          )
        )`,
        { restrictedUserId }
      );
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();

    if (data.length > 0) {
      const ds = this.repo.manager.connection;
      const counts: { project_id: string; count: number }[] = await ds.query(
        `SELECT project_id, COUNT(*)::int AS count FROM test_suites WHERE project_id = ANY($1::uuid[]) AND deleted_at IS NULL GROUP BY project_id`,
        [data.map((p) => p.id)]
      );
      const countMap = new Map(counts.map((r) => [r.project_id, r.count]));
      data.forEach((p) => {
        p.suiteCount = countMap.get(p.id) ?? 0;
      });
    }

    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id: string): Promise<Project | null> {
    return this.repo.findOne({
      where: { id },
      relations: { memberships: { user: true } },
    });
  }

  // Public feedback form lookup — token is the only credential, so no org scope.
  async findByFeedbackToken(token: string): Promise<Project | null> {
    return this.repo.findOne({ where: { feedbackToken: token } });
  }

  async create(data: Partial<Project>): Promise<Project> {
    return this.repo.save(this.repo.create(data));
  }

  async save(entity: Project): Promise<Project> {
    return this.repo.save(entity);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  // Project counts per organization for the superadmin's /platform page.
  async countByOrganizationIds(organizationIds: string[]): Promise<Map<string, number>> {
    if (!organizationIds.length) return new Map();
    const ds = this.repo.manager.connection;
    const rows: { organization_id: string; count: number }[] = await ds.query(
      `SELECT organization_id, COUNT(*)::int AS count FROM projects WHERE organization_id = ANY($1::uuid[]) AND deleted_at IS NULL GROUP BY organization_id`,
      [organizationIds]
    );
    return new Map(rows.map((r) => [r.organization_id, r.count]));
  }
}

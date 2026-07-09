// modules/organization/services/organization.service.ts
// Cross-org overview for the superadmin's /platform page. There's no
// Organization entity — this composes the User and Project repositories,
// which own the underlying organization_id column.
import { ProjectRepository } from "../../project/repositories/project.repository";

const { UserRepository } = require("../../user/repositories/user.repository");
const { buildMeta } = require("../../../shared/pagination/paginate");

export interface OrganizationSummary {
  organizationId: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  userCount: number;
  projectCount: number;
  createdAt: string;
}

interface OrgRow {
  organization_id: string;
  user_count: number;
  created_at: string | Date;
  owner_id: string;
  owner_email: string;
  owner_first_name: string;
  owner_last_name: string;
  company_name: string | null;
}

export class OrganizationService {
  static Instance = new OrganizationService();

  constructor(
    private readonly userRepo = UserRepository.Instance,
    private readonly projectRepo = ProjectRepository.Instance
  ) {}

  async fetchOrganizations(params: { page?: number; limit?: number; search?: string }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const { rows, total } = await this.userRepo.listOrganizations({
      page,
      limit,
      search: params.search,
    });

    const orgIds = (rows as OrgRow[]).map((r) => r.organization_id);
    const projectCounts = await this.projectRepo.countByOrganizationIds(orgIds);

    const data: OrganizationSummary[] = (rows as OrgRow[]).map((r) => ({
      organizationId: r.organization_id,
      name: r.company_name || `Organization ${r.organization_id.slice(0, 8)}`,
      ownerName: `${r.owner_first_name} ${r.owner_last_name}`.trim(),
      ownerEmail: r.owner_email,
      userCount: r.user_count,
      projectCount: projectCounts.get(r.organization_id) ?? 0,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    return { data, meta: buildMeta(page, limit, total, rows.length) };
  }
}

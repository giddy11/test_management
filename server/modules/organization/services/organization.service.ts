// modules/organization/services/organization.service.ts
// Cross-org overview for the superadmin's /platform page. There's no
// Organization entity — this composes the User and Project repositories,
// which own the underlying organization_id column.
import { ProjectRepository } from "../../project/repositories/project.repository";
import { SubscriptionService, type EffectivePlan } from "../../subscription/services/subscription.service";

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
  plan: Pick<EffectivePlan, "planKey" | "planName" | "status" | "blocked" | "assignedPlanKey" | "paidUntil" | "trialEndsAt" | "source" | "includedSeats" | "extraSeats">;
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
    private readonly projectRepo = ProjectRepository.Instance,
    private readonly plans = SubscriptionService.Instance
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
    const [projectCounts, plans] = await Promise.all([
      this.projectRepo.countByOrganizationIds(orgIds),
      this.plans.summaries(orgIds),
    ]);

    const data: OrganizationSummary[] = (rows as OrgRow[]).map((r) => ({
      organizationId: r.organization_id,
      name: r.company_name || `Organization ${r.organization_id.slice(0, 8)}`,
      ownerName: `${r.owner_first_name} ${r.owner_last_name}`.trim(),
      ownerEmail: r.owner_email,
      userCount: r.user_count,
      projectCount: projectCounts.get(r.organization_id) ?? 0,
      createdAt: new Date(r.created_at).toISOString(),
      plan: pickPlan(plans.get(r.organization_id)),
    }));

    return { data, meta: buildMeta(page, limit, total, rows.length) };
  }
}

function pickPlan(p: EffectivePlan | undefined): OrganizationSummary["plan"] {
  return {
    planKey: p?.planKey ?? "free",
    planName: p?.planName ?? "Free",
    status: p?.status ?? "none",
    blocked: p?.blocked ?? true,
    assignedPlanKey: p?.assignedPlanKey ?? "free",
    paidUntil: p?.paidUntil ?? null,
    trialEndsAt: p?.trialEndsAt ?? null,
    source: p?.source ?? null,
    includedSeats: p?.includedSeats ?? null,
    extraSeats: p?.extraSeats ?? 0,
  };
}

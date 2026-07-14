// modules/clientCompany/services/clientCompany.service.ts
// External client companies that use one of the org's products. Admin-only
// management: the company record, its public feedback form link, and its IT
// supporter accounts (users with role it_support scoped to the company).
import { randomUUID } from "crypto";
import { ClientCompanyRepository } from "../repositories/clientCompany.repository";
import { ProjectService } from "../../project/services/project.service";
import type { Actor } from "../../../shared/types/actor";
import type { ClientCompany } from "../entities/clientCompany.entity";

const { UserRepository } = require("../../user/repositories/user.repository");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, AuthProvider } = require("../../../config/constants");
const { hashPassword } = require("../../../shared/utils/password");
const { sendSupporterInviteEmail } = require("../../../shared/utils/mail/support.mail");
const { env } = require("../../../config/env");

export class ClientCompanyService {
  static Instance = new ClientCompanyService();

  companyRepo: ClientCompanyRepository;
  projectService: ProjectService;
  userRepo: any;

  constructor(
    companyRepo = ClientCompanyRepository.Instance,
    projectService = ProjectService.Instance,
    userRepo = UserRepository.Instance
  ) {
    this.companyRepo = companyRepo;
    this.projectService = projectService;
    this.userRepo = userRepo;
  }

  // Loads a company and asserts the actor can see its project. All admin
  // operations go through here.
  private async getAccessible(actor: Actor, id: string): Promise<ClientCompany> {
    const company = await this.companyRepo.findById(id);
    if (!company || company.deletedAt) throw new AppError("Client company not found", 404);
    await this.projectService.getProject(actor, company.projectId);
    return company;
  }

  async fetchCompanies(actor: Actor, projectId: string) {
    await this.projectService.getProject(actor, projectId);
    const companies = await this.companyRepo.fetchByProject(projectId);
    return Promise.all(
      companies.map(async (c) => ({
        company: c,
        supporterCount: await this.userRepo.countByClientCompany(c.id),
      }))
    );
  }

  async createCompany(
    actor: Actor,
    projectId: string,
    data: { name: string; contactEmail?: string | null }
  ) {
    const project = await this.projectService.getProject(actor, projectId);
    const company = await this.companyRepo.create({
      projectId,
      name: data.name,
      contactEmail: data.contactEmail ?? null,
    });
    ActivityService.Instance.log(actor, {
      action: "client_company.created",
      summary: `Added client company "${company.name}" to project "${project.name}"`,
      entityType: "client_company",
      entityId: company.id,
      metadata: { projectId },
    });
    return company;
  }

  async updateCompany(
    actor: Actor,
    id: string,
    data: { name?: string; contactEmail?: string | null }
  ) {
    const company = await this.getAccessible(actor, id);
    const patch: Partial<ClientCompany> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.contactEmail !== undefined) patch.contactEmail = data.contactEmail;
    return this.companyRepo.update(company.id, patch);
  }

  async deleteCompany(actor: Actor, id: string) {
    const company = await this.getAccessible(actor, id);
    const supporterCount = await this.userRepo.countByClientCompany(company.id);
    if (supporterCount > 0) {
      throw new AppError(
        "Remove this company's supporter accounts before deleting it",
        409
      );
    }
    await this.companyRepo.softDelete(company.id);
    ActivityService.Instance.log(actor, {
      action: "client_company.deleted",
      summary: `Deleted client company "${company.name}"`,
      entityType: "client_company",
      entityId: company.id,
      metadata: { projectId: company.projectId },
    });
  }

  // Enable (rotate) or disable the company's public feedback form link —
  // mirrors FeedbackService.setFeedbackLink for the project-level token.
  async setFeedbackLink(actor: Actor, id: string, enabled: boolean) {
    const company = await this.getAccessible(actor, id);
    company.feedbackToken = enabled ? randomUUID() : null;
    await this.companyRepo.save(company);
    return { feedbackToken: company.feedbackToken };
  }

  // ── Supporter accounts ───────────────────────────────────────────────────────

  async listSupporters(actor: Actor, id: string) {
    const company = await this.getAccessible(actor, id);
    return this.userRepo.findByClientCompany(company.id);
  }

  // Same recipe as UserService.createUser, but the account is an it_support
  // user tied to the client company; companyName shows THEIR company.
  async createSupporter(
    actor: Actor,
    id: string,
    data: { firstName: string; lastName: string; email: string; password: string }
  ) {
    const company = await this.getAccessible(actor, id);
    const project: any = await this.projectService.getProject(actor, company.projectId);

    const existing = await this.userRepo.findByEmail(data.email);
    if (existing) throw new AppError("An account with this email already exists", 409);

    const user = await this.userRepo.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: await hashPassword(data.password),
      role: UserRole.IT_SUPPORT,
      companyName: company.name,
      organizationId: actor.organizationId ?? null,
      clientCompanyId: company.id,
      provider: AuthProvider.LOCAL,
      isEmailVerified: true, // created by an admin — no self-verification needed
    });

    sendSupporterInviteEmail(
      user.email,
      user.firstName,
      company.name,
      project.name,
      data.password,
      `${env.appUrl}/login`,
      actor.organizationId ?? null
    ).catch((e: Error) => console.error("[mailer] supporter invite failed:", e.message));

    ActivityService.Instance.log(actor, {
      action: "client_company.supporter_added",
      summary: `Added IT supporter ${user.firstName} ${user.lastName} to "${company.name}"`,
      entityType: "client_company",
      entityId: company.id,
      metadata: { projectId: company.projectId, userId: user.id },
    });

    return user;
  }

  async removeSupporter(actor: Actor, id: string, userId: string) {
    const company = await this.getAccessible(actor, id);
    const user = await this.userRepo.findById(userId);
    if (
      !user ||
      user.deletedAt ||
      user.role !== UserRole.IT_SUPPORT ||
      user.clientCompanyId !== company.id
    ) {
      throw new AppError("Supporter not found in this company", 404);
    }
    await this.userRepo.softDelete(user.id);
    ActivityService.Instance.log(actor, {
      action: "client_company.supporter_removed",
      summary: `Removed IT supporter ${user.firstName} ${user.lastName} from "${company.name}"`,
      entityType: "client_company",
      entityId: company.id,
      metadata: { projectId: company.projectId, userId: user.id },
    });
  }
}

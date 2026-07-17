// modules/clientCompany/services/clientCompany.service.ts
// External client companies that use one of the org's products. Admin-only
// management: the company record, its public feedback form link, and its IT
// supporter accounts (users with role it_support scoped to the company).
import { randomUUID } from "crypto";
import { ClientCompanyRepository } from "../repositories/clientCompany.repository";
import { ProjectRepository } from "../../project/repositories/project.repository";
import { ProjectService } from "../../project/services/project.service";
import type { Actor } from "../../../shared/types/actor";
import type { ClientCompany } from "../entities/clientCompany.entity";

const { UserRepository } = require("../../user/repositories/user.repository");
const { ActivityService } = require("../../activity/services/activity.service");
const { AppError } = require("../../../shared/errors/AppError");
const { UserRole, AuthProvider } = require("../../../config/constants");
const { hashPassword, generateTempPassword } = require("../../../shared/utils/password");
const { sendSupporterInviteEmail } = require("../../../shared/utils/mail/support.mail");
const { env } = require("../../../config/env");

export class ClientCompanyService {
  static Instance = new ClientCompanyService();

  companyRepo: ClientCompanyRepository;
  projectRepo: ProjectRepository;
  projectService: ProjectService;
  userRepo: any;

  constructor(
    companyRepo = ClientCompanyRepository.Instance,
    projectService = ProjectService.Instance,
    userRepo = UserRepository.Instance,
    projectRepo = ProjectRepository.Instance
  ) {
    this.companyRepo = companyRepo;
    this.projectService = projectService;
    this.userRepo = userRepo;
    this.projectRepo = projectRepo;
  }

  // Loads a company and asserts the actor can see its project. All admin
  // operations go through here.
  private async getAccessible(actor: Actor, id: string): Promise<ClientCompany> {
    const company = await this.companyRepo.findById(id);
    if (!company || company.deletedAt) throw new AppError("Client company not found", 404);
    await this.projectService.getProject(actor, company.projectId);
    return company;
  }

  // Supporter-roster management (list/add/remove/promote) is the one area a
  // company can self-serve: its own IT support lead can do it too, not just
  // the product team — scoped strictly to their own company. Everything else
  // about a client company (the record itself, its ticket-form link) stays
  // product-team-only.
  private async getAccessibleForSupporterManagement(actor: Actor, id: string): Promise<ClientCompany> {
    if (actor.role === UserRole.IT_SUPPORT) {
      if (!actor.isSupportLead || actor.clientCompanyId !== id) {
        throw new AppError("Only this company's IT support lead can manage its supporters", 403);
      }
      const company = await this.companyRepo.findById(id);
      if (!company || company.deletedAt) throw new AppError("Client company not found", 404);
      return company;
    }
    return this.getAccessible(actor, id);
  }

  // Self-service lookup for the support portal — an IT supporter's own
  // company record, without the admin-only GET / list surface.
  async fetchMyCompany(actor: Actor) {
    if (actor.role !== UserRole.IT_SUPPORT || !actor.clientCompanyId) {
      throw new AppError("Only IT supporters have a company to manage", 403);
    }
    const company = await this.companyRepo.findById(actor.clientCompanyId);
    if (!company || company.deletedAt) throw new AppError("Client company not found", 404);
    const supporterCount = await this.userRepo.countByClientCompany(company.id);
    return { company, supporterCount };
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

  // A contact email must be unique across every client company in the
  // application, and must not already belong to a user account (org member
  // or supporter).
  private async assertContactEmailAvailable(email: string, excludeCompanyId?: string) {
    const existingCompany = await this.companyRepo.findByEmail(email);
    if (existingCompany && existingCompany.id !== excludeCompanyId) {
      throw new AppError("A client company with this contact email already exists", 409);
    }
    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      throw new AppError("This email already belongs to a user account", 409);
    }
  }

  async createCompany(
    actor: Actor,
    projectId: string,
    data: { name: string; contactEmail?: string | null }
  ) {
    const project = await this.projectService.getProject(actor, projectId);
    if (data.contactEmail) {
      await this.assertContactEmailAvailable(data.contactEmail);
    }
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
      clientCompanyId: company.id,
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
    if (data.contactEmail && data.contactEmail !== company.contactEmail) {
      await this.assertContactEmailAvailable(data.contactEmail, company.id);
    }
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
      clientCompanyId: company.id,
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

  // A support lead provisioned server-to-server arrives as just an email —
  // derive a display name from its local part (e.g. "sam.support" -> "Sam
  // Support") since firstName/lastName are NOT NULL columns on User. Purely
  // cosmetic; the lead can change it later from their own profile.
  private nameFromEmail(email: string): { firstName: string; lastName: string } {
    const localPart = email.split("@")[0] ?? "";
    const words = localPart
      .split(/[.\-_+]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    const [firstName = "Support", ...rest] = words;
    return { firstName, lastName: rest.join(" ") };
  }

  // ── Server-to-server company provisioning (no auth — see route comment) ────
  // A partner's own backend calls this the moment one of their customers signs
  // up, creating the ClientCompany and its first IT support lead in one shot —
  // no TestMate admin has to do either step by hand. No actor here — this is
  // machine traffic, so there's no activity log entry (no human to attribute
  // it to).
  async provisionCompany(data: {
    projectId: string;
    name: string;
    contactEmail?: string | null;
    supportLead: { email: string };
  }) {
    const project = await this.projectRepo.findById(data.projectId);
    if (!project || project.deletedAt) throw new AppError("Project not found", 404);

    if (data.contactEmail) {
      await this.assertContactEmailAvailable(data.contactEmail);
    }
    const existingLead = await this.userRepo.findByEmail(data.supportLead.email);
    if (existingLead) {
      throw new AppError("An account with this email already exists", 409);
    }

    const company = await this.companyRepo.create({
      projectId: project.id,
      name: data.name,
      contactEmail: data.contactEmail ?? null,
    });

    const tempPassword = generateTempPassword();
    const { firstName, lastName } = this.nameFromEmail(data.supportLead.email);
    const supportLead = await this.userRepo.create({
      firstName,
      lastName,
      email: data.supportLead.email,
      password: await hashPassword(tempPassword),
      role: UserRole.IT_SUPPORT,
      companyName: company.name,
      organizationId: project.organizationId ?? null,
      clientCompanyId: company.id,
      provider: AuthProvider.LOCAL,
      isEmailVerified: true, // provisioned server-to-server — no self-verification needed
      isSupportLead: true,
      isPrimarySupportLead: true, // always this brand-new company's first (and only) lead
    });

    sendSupporterInviteEmail(
      supportLead.email,
      supportLead.firstName,
      company.name,
      project.name,
      tempPassword,
      `${env.appUrl}/login`,
      project.organizationId ?? null
    ).catch((e: Error) => console.error("[clientCompany] provisioning invite failed:", e.message));

    return { company, supportLead };
  }

  // ── Supporter accounts ───────────────────────────────────────────────────────

  async listSupporters(actor: Actor, id: string) {
    const company = await this.getAccessibleForSupporterManagement(actor, id);
    return this.userRepo.findByClientCompany(company.id);
  }

  // Same recipe as UserService.createUser, but the account is an it_support
  // user tied to the client company; companyName shows THEIR company.
  async createSupporter(
    actor: Actor,
    id: string,
    data: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      isSupportLead?: boolean;
    }
  ) {
    const company = await this.getAccessibleForSupporterManagement(actor, id);
    // Access is already established above (product-team or the company's own
    // lead) — a raw lookup avoids re-running the admin-oriented project
    // access check, which an IT support actor wouldn't pass.
    const project: any = await this.projectRepo.findById(company.projectId);

    const existing = await this.userRepo.findByEmail(data.email);
    if (existing) throw new AppError("An account with this email already exists", 409);

    // The company's very first lead becomes its primary lead automatically —
    // only reachable here when actor is an admin, since a self-service lead
    // creating a supporter implies the company already has at least one lead
    // (themselves), so this can never be gamed by a peer lead.
    let isPrimarySupportLead = false;
    if (data.isSupportLead) {
      const existingSupporters = await this.userRepo.findByClientCompany(company.id);
      isPrimarySupportLead = !existingSupporters.some((s: any) => s.isSupportLead);
    }

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
      isSupportLead: data.isSupportLead ?? false,
      isPrimarySupportLead,
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
      clientCompanyId: company.id,
      metadata: { projectId: company.projectId, userId: user.id },
    });

    return user;
  }

  // A company's roster must never end up non-empty with zero leads — that
  // would strand it until a TestMate admin steps in to re-promote someone
  // (see setSupporterLead / removeSupporter). Dropping to zero supporters
  // entirely is fine — that's the normal path to deleting the company.
  private async assertLeadRemovalSafe(companyId: string, excludingUserId: string): Promise<void> {
    const supporters = await this.userRepo.findByClientCompany(companyId);
    const remaining = supporters.filter((s: any) => s.id !== excludingUserId);
    const hasRemainingLead = remaining.some((s: any) => s.isSupportLead);
    if (remaining.length > 0 && !hasRemainingLead) {
      throw new AppError(
        "This is the company's only IT support lead — promote another supporter first.",
        409
      );
    }
  }

  async removeSupporter(actor: Actor, id: string, userId: string) {
    const company = await this.getAccessibleForSupporterManagement(actor, id);
    const user = await this.userRepo.findById(userId);
    if (
      !user ||
      user.deletedAt ||
      user.role !== UserRole.IT_SUPPORT ||
      user.clientCompanyId !== company.id
    ) {
      throw new AppError("Supporter not found in this company", 404);
    }
    // A lead self-managing their own company's roster can't remove their own
    // account — that's how someone locks themselves out. Only reachable via
    // the self-service path (an admin's id can never match a supporter's).
    if (actor.id === user.id) {
      throw new AppError(
        "You can't remove your own account — ask another lead or a TestMate admin",
        403
      );
    }
    // Peer leads can manage each other freely, but the primary lead is
    // protected from anyone but a TestMate admin.
    if (user.isPrimarySupportLead && actor.role === UserRole.IT_SUPPORT) {
      throw new AppError("Only a TestMate admin can remove the primary lead", 403);
    }
    if (user.isSupportLead) {
      await this.assertLeadRemovalSafe(company.id, user.id);
    }
    await this.userRepo.softDelete(user.id);
    ActivityService.Instance.log(actor, {
      action: "client_company.supporter_removed",
      summary: `Removed IT supporter ${user.firstName} ${user.lastName} from "${company.name}"`,
      entityType: "client_company",
      entityId: company.id,
      clientCompanyId: company.id,
      metadata: { projectId: company.projectId, userId: user.id },
    });
  }

  // Promote/demote a supporter to lead — leads can assign incoming queue
  // items to their teammates within the same company.
  async setSupporterLead(actor: Actor, id: string, userId: string, isSupportLead: boolean) {
    const company = await this.getAccessibleForSupporterManagement(actor, id);
    const user = await this.userRepo.findById(userId);
    if (
      !user ||
      user.deletedAt ||
      user.role !== UserRole.IT_SUPPORT ||
      user.clientCompanyId !== company.id
    ) {
      throw new AppError("Supporter not found in this company", 404);
    }
    // A lead can't change their own lead status — same reasoning as
    // removeSupporter above (only reachable via the self-service path).
    if (actor.id === user.id) {
      throw new AppError(
        "You can't change your own lead status — ask another lead or a TestMate admin",
        403
      );
    }
    // Peer leads can promote/demote each other freely, but the primary lead
    // is protected from anyone but a TestMate admin.
    if (user.isPrimarySupportLead && actor.role === UserRole.IT_SUPPORT) {
      throw new AppError("Only a TestMate admin can change the primary lead's status", 403);
    }
    if (user.isSupportLead && !isSupportLead) {
      await this.assertLeadRemovalSafe(company.id, user.id);
    }
    const patch: { isSupportLead: boolean; isPrimarySupportLead?: boolean } = { isSupportLead };
    // A demoted lead can't stay marked primary. The bootstrap case (promoting
    // this company's first-ever lead) only reaches here via an admin actor —
    // a self-service lead already implies the company has an existing lead.
    if (!isSupportLead) {
      if (user.isPrimarySupportLead) patch.isPrimarySupportLead = false;
    } else if (!user.isPrimarySupportLead) {
      const existingSupporters = await this.userRepo.findByClientCompany(company.id);
      const hasExistingLead = existingSupporters.some(
        (s: any) => s.id !== user.id && s.isSupportLead
      );
      if (!hasExistingLead) patch.isPrimarySupportLead = true;
    }
    const updated = await this.userRepo.update(user.id, patch);
    ActivityService.Instance.log(actor, {
      action: "client_company.supporter_lead_changed",
      summary: isSupportLead
        ? `Made ${user.firstName} ${user.lastName} an IT support lead at "${company.name}"`
        : `Removed ${user.firstName} ${user.lastName} as IT support lead at "${company.name}"`,
      entityType: "client_company",
      entityId: company.id,
      clientCompanyId: company.id,
      metadata: { projectId: company.projectId, userId: user.id },
    });
    return updated;
  }

  // Designate (or clear) this company's primary lead — admin-only, never
  // self-service, since the whole point is that peer leads can't do this to
  // each other (see setSupporterLead/removeSupporter above).
  async setPrimarySupportLead(actor: Actor, id: string, userId: string, isPrimary: boolean) {
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
    if (isPrimary && !user.isSupportLead) {
      throw new AppError("Promote this supporter to lead before making them primary", 409);
    }

    if (isPrimary) {
      await this.userRepo.clearPrimarySupportLead(company.id);
    }
    const updated = await this.userRepo.update(user.id, { isPrimarySupportLead: isPrimary });

    ActivityService.Instance.log(actor, {
      action: "client_company.primary_lead_changed",
      summary: isPrimary
        ? `Made ${user.firstName} ${user.lastName} the primary IT support lead at "${company.name}"`
        : `Cleared ${user.firstName} ${user.lastName} as the primary IT support lead at "${company.name}"`,
      entityType: "client_company",
      entityId: company.id,
      clientCompanyId: company.id,
      metadata: { projectId: company.projectId, userId: user.id },
    });
    return updated;
  }
}

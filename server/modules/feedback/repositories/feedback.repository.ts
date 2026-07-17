// modules/feedback/repositories/feedback.repository.ts
import type { Repository } from "typeorm";
import { Feedback } from "../entities/feedback.entity";
import { FeedbackAttachment } from "../entities/feedbackAttachment.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

export interface FetchFeedbackParams {
  // Omitted => cross-project (global) mode, scoped by organizationId /
  // restrictedUserId below.
  projectId?: string;
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  search?: string;
  // IT-queue mode: only this client company's items (all support states unless
  // supportStatus narrows it). Bypasses the escalated-only visibility rule.
  clientCompanyId?: string;
  supportStatus?: string;
  // IT-queue mode only: narrow to one supporter's assigned items, or to
  // items nobody has been routed to yet.
  assignedSupporterId?: string;
  unassigned?: boolean;
  // Global-mode scoping: admins see their org's projects...
  organizationId?: string;
  // ...plain users only projects they're members of.
  restrictedUserId?: string;
  // Integration lookup: exact-match a submitter's own tickets (their "history").
  submitterEmail?: string;
}

export class FeedbackRepository {
  static Instance = new FeedbackRepository();

  private repo: Repository<Feedback>;
  private attachmentRepo: Repository<FeedbackAttachment>;

  constructor() {
    this.repo = AppDataSource.getRepository(Feedback);
    this.attachmentRepo = AppDataSource.getRepository(FeedbackAttachment);
  }

  async fetchPaginated({
    projectId,
    page = 1,
    limit = 20,
    status,
    type,
    search,
    clientCompanyId,
    supportStatus,
    assignedSupporterId,
    unassigned,
    organizationId,
    restrictedUserId,
    submitterEmail,
  }: FetchFeedbackParams) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("fb")
      .leftJoinAndSelect("fb.assignees", "assignee")
      .leftJoinAndSelect("fb.attachments", "attachment")
      .leftJoinAndSelect("fb.clientCompany", "clientCompany")
      .leftJoinAndSelect("fb.escalatedBy", "escalatedBy")
      .leftJoinAndSelect("fb.assignedSupporter", "assignedSupporter")
      .where("fb.deleted_at IS NULL")
      .orderBy("fb.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (clientCompanyId) {
      // IT-queue mode — a company's supporters see all their items regardless
      // of escalation state.
      qb.andWhere("fb.client_company_id = :clientCompanyId", { clientCompanyId }); // indexed
      if (supportStatus) qb.andWhere("fb.support_status = :supportStatus", { supportStatus });
      if (unassigned) qb.andWhere("fb.assigned_supporter_id IS NULL");
      else if (assignedSupporterId)
        qb.andWhere("fb.assigned_supporter_id = :assignedSupporterId", { assignedSupporterId }); // indexed
    } else {
      // Product-owner views never see un-escalated client-company items.
      qb.andWhere("(fb.client_company_id IS NULL OR fb.support_status = 'escalated')");
    }

    if (projectId) {
      qb.andWhere("fb.project_id = :projectId", { projectId }); // indexed
    } else if (!clientCompanyId) {
      // Global (cross-project) mode — join the project for name + org scoping.
      qb.leftJoinAndSelect("fb.project", "project").andWhere("project.deleted_at IS NULL");
      if (organizationId) {
        qb.andWhere("project.organization_id = :organizationId", { organizationId }); // indexed
      }
      if (restrictedUserId) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = fb.project_id AND pm.user_id = :restrictedUserId
          )`,
          { restrictedUserId }
        );
      }
    }

    if (status) qb.andWhere("fb.status = :status", { status });
    if (type) qb.andWhere("fb.type = :type", { type });
    if (submitterEmail) qb.andWhere("fb.submitter_email = :submitterEmail", { submitterEmail });
    if (search) {
      qb.andWhere("(fb.title ILIKE :search OR fb.submitter_email ILIKE :search)", {
        search: `%${search}%`,
      });
    }

    const total = page === 1 ? await qb.getCount() : 0;
    const data = await qb.getMany();
    return { data, meta: buildMeta(page, limit, total, data.length) };
  }

  async findById(id: string): Promise<Feedback | null> {
    return this.repo.findOne({
      where: { id },
      relations: {
        assignees: true,
        attachments: true,
        clientCompany: true,
        escalatedBy: true,
        assignedSupporter: true,
      },
    });
  }

  async create(data: Partial<Feedback>): Promise<Feedback> {
    return this.repo.save(this.repo.create(data));
  }

  // Idempotency lookup for integration ticket creation — scoped to the
  // owning client company (one partner integration = one company).
  async findByCompanyAndExternalRef(
    clientCompanyId: string,
    externalRef: string
  ): Promise<Feedback | null> {
    return this.repo.findOne({ where: { clientCompanyId, externalRef } });
  }

  async addAttachments(
    feedbackId: string,
    files: { url: string; publicId: string }[]
  ): Promise<void> {
    if (files.length === 0) return;
    await this.attachmentRepo.save(
      files.map((f) => ({ feedbackId, url: f.url, publicId: f.publicId }))
    );
  }

  async update(
    id: string,
    patch: Partial<
      Omit<Feedback, "project" | "assignees" | "clientCompany" | "escalatedBy" | "assignedSupporter">
    >
  ): Promise<Feedback | null> {
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  // Replaces the assignee set on a feedback item. `users` is an array of `{ id }` refs.
  async setAssignees(feedback: Feedback, users: { id: string }[]): Promise<Feedback> {
    feedback.assignees = users as Feedback["assignees"];
    return this.repo.save(feedback);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}

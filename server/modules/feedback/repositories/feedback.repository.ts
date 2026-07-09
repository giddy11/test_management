// modules/feedback/repositories/feedback.repository.ts
import type { Repository } from "typeorm";
import { Feedback } from "../entities/feedback.entity";
import { FeedbackAttachment } from "../entities/feedbackAttachment.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const { buildMeta, getOffset } = require("../../../shared/pagination/paginate");

export interface FetchFeedbackParams {
  projectId: string;
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  search?: string;
}

export class FeedbackRepository {
  static Instance = new FeedbackRepository();

  private repo: Repository<Feedback>;
  private attachmentRepo: Repository<FeedbackAttachment>;

  constructor() {
    this.repo = AppDataSource.getRepository(Feedback);
    this.attachmentRepo = AppDataSource.getRepository(FeedbackAttachment);
  }

  async fetchPaginated({ projectId, page = 1, limit = 20, status, type, search }: FetchFeedbackParams) {
    const offset = getOffset(page, limit);
    const qb = this.repo
      .createQueryBuilder("fb")
      .leftJoinAndSelect("fb.assignees", "assignee")
      .leftJoinAndSelect("fb.attachments", "attachment")
      .where("fb.project_id = :projectId", { projectId }) // indexed
      .andWhere("fb.deleted_at IS NULL")
      .orderBy("fb.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (status) qb.andWhere("fb.status = :status", { status });
    if (type) qb.andWhere("fb.type = :type", { type });
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
      relations: { assignees: true, attachments: true },
    });
  }

  async create(data: Partial<Feedback>): Promise<Feedback> {
    return this.repo.save(this.repo.create(data));
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
    patch: Partial<Omit<Feedback, "project" | "assignees">>
  ): Promise<Feedback | null> {
    await this.repo.update(id, patch);
    return this.findById(id);
  }

  // Replaces the assignee set on a feedback item. `users` is an array of `{ id }` refs.
  async setAssignees(feedback: Feedback, users: { id: string }[]): Promise<Feedback> {
    feedback.assignees = users as Feedback["assignees"];
    return this.repo.save(feedback);
  }
}

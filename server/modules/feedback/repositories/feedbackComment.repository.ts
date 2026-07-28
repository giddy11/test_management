// modules/feedback/repositories/feedbackComment.repository.ts
import type { Repository } from "typeorm";
import { FeedbackComment } from "../entities/feedbackComment.entity";
import { FeedbackCommentAttachment } from "../entities/feedbackCommentAttachment.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export class FeedbackCommentRepository {
  static Instance = new FeedbackCommentRepository();

  private repo: Repository<FeedbackComment>;
  private attachmentRepo: Repository<FeedbackCommentAttachment>;

  constructor() {
    this.repo = AppDataSource.getRepository(FeedbackComment);
    this.attachmentRepo = AppDataSource.getRepository(FeedbackCommentAttachment);
  }

  // Oldest first — a thread reads top-to-bottom like a conversation.
  async findByFeedback(feedbackId: string): Promise<FeedbackComment[]> {
    return this.repo.find({
      where: { feedbackId },
      relations: { attachments: true },
      order: { createdAt: "ASC" },
    });
  }

  async findById(id: string): Promise<FeedbackComment | null> {
    return this.repo.findOne({ where: { id }, relations: { attachments: true } });
  }

  async create(data: {
    feedbackId: string;
    authorType: string;
    authorId: string | null;
    authorName: string;
    body: string;
  }): Promise<FeedbackComment> {
    const saved = await this.repo.save(this.repo.create(data));
    return (await this.repo.findOne({ where: { id: saved.id }, relations: { attachments: true } }))!;
  }

  async addAttachments(
    commentId: string,
    files: { fileName: string; fileUrl: string; filePublicId: string; mimeType: string; fileSizeBytes: number }[]
  ): Promise<void> {
    if (files.length === 0) return;
    await this.attachmentRepo.save(
      files.map((f) => ({
        commentId,
        fileName: f.fileName,
        fileUrl: f.fileUrl,
        filePublicId: f.filePublicId,
        mimeType: f.mimeType,
        fileSizeBytes: f.fileSizeBytes,
      }))
    );
  }
}

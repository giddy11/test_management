// modules/feedback/repositories/feedbackLookupCode.repository.ts
import type { Repository } from "typeorm";
import { FeedbackLookupCode } from "../entities/feedbackLookupCode.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export class FeedbackLookupCodeRepository {
  static Instance = new FeedbackLookupCodeRepository();

  private repo: Repository<FeedbackLookupCode>;

  constructor() {
    this.repo = AppDataSource.getRepository(FeedbackLookupCode);
  }

  // Same recipe as AuthRepository.invalidateOtps — one active code per email
  // at a time.
  async invalidateActive(email: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(FeedbackLookupCode)
      .set({ consumedAt: () => "now()" })
      .where("email = :email", { email })
      .andWhere("consumed_at IS NULL")
      .execute();
  }

  async save(data: Partial<FeedbackLookupCode>): Promise<FeedbackLookupCode> {
    return this.repo.save(this.repo.create(data));
  }

  async findActive(email: string, codeHash: string): Promise<FeedbackLookupCode | null> {
    return this.repo
      .createQueryBuilder("code")
      .where("code.email = :email", { email })
      .andWhere("code.code_hash = :codeHash", { codeHash })
      .andWhere("code.consumed_at IS NULL")
      .andWhere("code.expires_at > now()")
      .getOne();
  }
}

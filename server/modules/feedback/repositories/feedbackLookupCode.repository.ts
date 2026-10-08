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

  // Retires all but this email's `keep` newest still-valid codes — called
  // just before a new one is saved, so a person has at most keep + 1 live
  // codes. Unlike the auth OTPs (one at a time), a code requested from the
  // widget, the My Tickets page, or another device keeps working until its
  // own expiry instead of the newest request silently killing the rest.
  //
  // Emails compare case-insensitively everywhere here — "Jane@Example.com"
  // and "jane@example.com" are the same inbox. LOWER() on both sides also
  // covers rows saved before emails were stored lowercased.
  async invalidateAllButNewest(email: string, keep: number): Promise<void> {
    const newest: { id: string }[] =
      keep > 0
        ? await this.repo
            .createQueryBuilder("code")
            .select("code.id", "id")
            .where("LOWER(code.email) = LOWER(:email)", { email })
            .andWhere("code.consumed_at IS NULL")
            .andWhere("code.expires_at > now()")
            .orderBy("code.createdAt", "DESC")
            .limit(keep)
            .getRawMany()
        : [];

    const qb = this.repo
      .createQueryBuilder()
      .update(FeedbackLookupCode)
      .set({ consumedAt: () => "now()" })
      .where("LOWER(email) = LOWER(:email)", { email })
      .andWhere("consumed_at IS NULL");
    if (newest.length > 0) qb.andWhere("id NOT IN (:...keepIds)", { keepIds: newest.map((r) => r.id) });
    await qb.execute();
  }

  async save(data: Partial<FeedbackLookupCode>): Promise<FeedbackLookupCode> {
    return this.repo.save(this.repo.create({ ...data, email: data.email?.toLowerCase() }));
  }

  async findActive(email: string, codeHash: string): Promise<FeedbackLookupCode | null> {
    return this.repo
      .createQueryBuilder("code")
      .where("LOWER(code.email) = LOWER(:email)", { email })
      .andWhere("code.code_hash = :codeHash", { codeHash })
      .andWhere("code.consumed_at IS NULL")
      .andWhere("code.expires_at > now()")
      .getOne();
  }
}

// modules/reviewPrompt/repositories/reviewPrompt.repository.ts
import type { Repository } from "typeorm";
import { ReviewPromptSettings, ReviewPromptState } from "../entities/reviewPrompt.entity";
import type {
  ReviewPromptSettings as Settings,
  ReviewPromptState as State,
} from "../entities/reviewPrompt.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

const SINGLETON_ID = "global";

export class ReviewPromptRepository {
  static Instance = new ReviewPromptRepository();

  private settings: Repository<Settings>;
  private states: Repository<State>;

  constructor() {
    this.settings = AppDataSource.getRepository(ReviewPromptSettings);
    this.states = AppDataSource.getRepository(ReviewPromptState);
  }

  findSettings(): Promise<Settings | null> {
    return this.settings.findOne({ where: { id: SINGLETON_ID } });
  }

  async saveSettings(patch: { enabled: boolean; intervalHours: number; updatedBy: string }): Promise<Settings> {
    return this.settings.save(this.settings.create({ id: SINGLETON_ID, ...patch }));
  }

  // Whether this person has been shown the pop-up within the interval. Only a
  // shortcut that skips the item queries; claim() is what decides.
  async promptedWithin(userId: string, intervalHours: number): Promise<boolean> {
    const rows = await this.states.query(
      `SELECT 1 FROM "review_prompt_states"
        WHERE "user_id" = $1 AND "last_prompted_at" > now() - make_interval(hours => $2::int)`,
      [userId, intervalHours]
    );
    return rows.length > 0;
  }

  // Records that the pop-up is being shown, unless it already was within the
  // interval. One statement, so of several tabs asking at once only one wins.
  async claim(userId: string, intervalHours: number): Promise<boolean> {
    const rows = await this.states.query(
      `INSERT INTO "review_prompt_states" AS s ("user_id", "last_prompted_at")
       VALUES ($1, now())
       ON CONFLICT ("user_id") DO UPDATE SET "last_prompted_at" = now()
         WHERE s."last_prompted_at" <= now() - make_interval(hours => $2::int)
       RETURNING "user_id"`,
      [userId, intervalHours]
    );
    return rows.length > 0;
  }
}

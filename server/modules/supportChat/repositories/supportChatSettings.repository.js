// modules/supportChat/repositories/supportChatSettings.repository.js
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { SupportChatSettings } = require("../entities/supportChatSettings.entity");

const SINGLETON_ID = "global";

class SupportChatSettingsRepository {
  static Instance = new SupportChatSettingsRepository();

  constructor() {
    this.repo = AppDataSource.getRepository(SupportChatSettings);
  }

  // Lazily creates the single row on first read (default: enabled) — no seed needed.
  async getOrCreate() {
    const existing = await this.repo.findOne({ where: { id: SINGLETON_ID } });
    if (existing) return existing;
    return this.repo.save(this.repo.create({ id: SINGLETON_ID, enabled: true, updatedBy: null }));
  }

  async setEnabled(enabled, updatedBy) {
    await this.getOrCreate();
    await this.repo.update(SINGLETON_ID, { enabled, updatedBy: updatedBy ?? null });
    return this.getOrCreate();
  }
}

module.exports = { SupportChatSettingsRepository };

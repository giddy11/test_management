// modules/appUpdate/services/appUpdate.service.ts
import { AppUpdateRepository } from "../repositories/appUpdate.repository";
import type { CreateAppUpdateData } from "../repositories/appUpdate.repository";
import type { Actor } from "../../../shared/types/actor";

const { AuthRepository } = require("../../auth/repositories/auth.repository");

export class AppUpdateService {
  static Instance = new AppUpdateService();

  updateRepo: AppUpdateRepository;
  authRepo: any;

  constructor(
    updateRepo = AppUpdateRepository.Instance,
    authRepo = AuthRepository.Instance
  ) {
    this.updateRepo = updateRepo;
    this.authRepo = authRepo;
  }

  // Superadmin publishes an announcement, targeted at all users, all admins,
  // or a hand-picked list; recipients will see it on next load.
  async createUpdate(data: CreateAppUpdateData) {
    return this.updateRepo.create(data);
  }

  // Publishes a batch of announcements in one action — e.g. a release's worth
  // of updates drafted together and published all at once.
  async createBulkUpdates(items: CreateAppUpdateData[]) {
    return this.updateRepo.createMany(items);
  }

  async fetchAll() {
    return this.updateRepo.findAll();
  }

  // Announcements this actor hasn't dismissed yet and is targeted by.
  async fetchUnseen(actor: Actor) {
    const user = await this.authRepo.findUserById(actor.id);
    return this.updateRepo.findUnseen(
      { id: actor.id, role: actor.role },
      user?.updatesSeenAt ?? null
    );
  }

  // Dismissing the modal marks everything published so far as seen.
  async markSeen(actor: Actor) {
    await this.authRepo.updateUser(actor.id, { updatesSeenAt: new Date() });
  }

  // Removes several published updates at once from the Announcements page.
  async deleteUpdates(ids: string[]) {
    await this.updateRepo.softDeleteMany(ids);
  }
}

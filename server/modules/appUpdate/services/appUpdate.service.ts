// modules/appUpdate/services/appUpdate.service.ts
import { AppUpdateRepository } from "../repositories/appUpdate.repository";
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

  // Superadmin publishes an announcement; admins will see it on next load.
  async createUpdate(data: { title: string; body: string }) {
    return this.updateRepo.create(data);
  }

  async fetchAll() {
    return this.updateRepo.findAll();
  }

  // Announcements this admin hasn't dismissed yet.
  async fetchUnseen(actor: Actor) {
    const user = await this.authRepo.findUserById(actor.id);
    return this.updateRepo.findUnseen(user?.updatesSeenAt ?? null);
  }

  // Dismissing the modal marks everything published so far as seen.
  async markSeen(actor: Actor) {
    await this.authRepo.updateUser(actor.id, { updatesSeenAt: new Date() });
  }
}

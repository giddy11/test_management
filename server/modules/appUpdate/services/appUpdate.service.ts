// modules/appUpdate/services/appUpdate.service.ts
import { AppUpdateRepository } from "../repositories/appUpdate.repository";
import type { CreateAppUpdateData } from "../repositories/appUpdate.repository";
import type { Actor } from "../../../shared/types/actor";

const { AuthRepository } = require("../../auth/repositories/auth.repository");
const { getIO, emitToRoom, emitToUsers } = require("../../../infrastructure/realtime/socketServer");

// Tells exactly the announcement's target audience to refetch their unseen
// list live — global emit for "all", the shared "admins" room for "admins",
// or a direct per-recipient push for "custom". Recipients with no open
// socket simply pick it up on their next load, same as the site banner.
function broadcastPublished(update: { audience: string; recipientIds?: string[] | null }) {
  if (update.audience === "all") {
    getIO()?.emit("app-update:published", {});
  } else if (update.audience === "admins") {
    emitToRoom("admins", "app-update:published", {});
  } else {
    emitToUsers(update.recipientIds ?? [], "app-update:published", {});
  }
}

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
  // or a hand-picked list; a live socket push nudges recipients to refetch
  // immediately, with next-load fetch as the fallback for anyone offline.
  async createUpdate(data: CreateAppUpdateData) {
    const update = await this.updateRepo.create(data);
    broadcastPublished(update);
    return update;
  }

  // Publishes a batch of announcements in one action — e.g. a release's worth
  // of updates drafted together and published all at once.
  async createBulkUpdates(items: CreateAppUpdateData[]) {
    const updates = await this.updateRepo.createMany(items);
    updates.forEach(broadcastPublished);
    return updates;
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

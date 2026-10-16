// modules/ai/repositories/aiCredential.repository.ts
// Data access for saved AI provider keys. An "owner" is either the
// organisation (userId null) or one user. Every write that changes an owner's
// keys runs in one transaction with its audit entry, so the invariants — one
// active key per owner, a feature pinned to at most one key — can't be left
// half-applied.
import type { EntityManager, Repository } from "typeorm";
import { IsNull } from "typeorm";
import { AiCredential } from "../entities/aiCredential.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import type { AiProviderId } from "../../../infrastructure/ai/aiProvider";

const { ActivityLog } = require("../../activity/entities/activityLog.entity");

export interface AiKeyOwner {
  organizationId: string;
  userId: string | null; // null = the organisation's key
}

export type AuditEntry = Record<string, unknown>;

export class AiCredentialRepository {
  static Instance = new AiCredentialRepository();

  private repo: Repository<AiCredential>;

  constructor() {
    this.repo = AppDataSource.getRepository(AiCredential);
  }

  private where(owner: AiKeyOwner) {
    return owner.userId
      ? { organizationId: owner.organizationId, userId: owner.userId }
      : { organizationId: owner.organizationId, userId: IsNull() };
  }

  // Oldest first, so the list doesn't reorder when a key is edited.
  async listFor(owner: AiKeyOwner): Promise<AiCredential[]> {
    return this.repo.find({ where: this.where(owner), order: { createdAt: "ASC" } });
  }

  async findFor(owner: AiKeyOwner, provider: AiProviderId): Promise<AiCredential | null> {
    return this.repo.findOne({ where: { ...this.where(owner), provider } });
  }

  // Insert or update one key. `makeActive` deactivates the owner's others.
  async save(
    owner: AiKeyOwner,
    values: Partial<AiCredential> & { provider: AiProviderId },
    makeActive: boolean,
    audit: AuditEntry
  ): Promise<AiCredential> {
    return AppDataSource.transaction(async (m) => {
      const repo = m.getRepository(AiCredential);
      const existing = await repo.findOne({ where: { ...this.where(owner), provider: values.provider } });
      if (makeActive) await this.deactivateAll(m, owner);
      const row = existing
        ? repo.merge(existing, values, makeActive ? { isActive: true } : {})
        : repo.create({
            ...values,
            organizationId: owner.organizationId,
            userId: owner.userId,
            featureModels: values.featureModels ?? {},
            isActive: makeActive,
          });
      const saved = await repo.save(row);
      await m.insert(ActivityLog, audit);
      return saved;
    });
  }

  async activate(owner: AiKeyOwner, provider: AiProviderId, audit: AuditEntry): Promise<void> {
    await AppDataSource.transaction(async (m) => {
      await this.deactivateAll(m, owner);
      await m.getRepository(AiCredential).update({ ...this.where(owner), provider }, { isActive: true });
      await m.insert(ActivityLog, audit);
    });
  }

  // Blanks the sealed key before soft-deleting, so a removed key is gone, not
  // merely hidden. If it was the active one, the owner's oldest remaining key
  // takes over, so removing a key never silently turns AI off while others exist.
  async remove(owner: AiKeyOwner, provider: AiProviderId, audit: AuditEntry): Promise<void> {
    await AppDataSource.transaction(async (m) => {
      const repo = m.getRepository(AiCredential);
      const row = await repo.findOne({ where: { ...this.where(owner), provider } });
      if (!row) return;
      await repo.update({ id: row.id }, { keyCiphertext: "", isActive: false, featureModels: {} });
      await repo.softDelete({ id: row.id });
      if (row.isActive) {
        const next = await repo.findOne({ where: this.where(owner), order: { createdAt: "ASC" } });
        if (next) await repo.update({ id: next.id }, { isActive: true });
      }
      await m.insert(ActivityLog, audit);
    });
  }

  // Pins `feature` to the owner's key for `provider` (or unpins it everywhere
  // when model is null). A feature is pinned to at most one key, so it's
  // removed from every other key of this owner in the same transaction.
  async setFeatureModel(
    owner: AiKeyOwner,
    feature: string,
    target: { provider: AiProviderId; model: string } | null,
    audit: AuditEntry
  ): Promise<void> {
    await AppDataSource.transaction(async (m) => {
      const repo = m.getRepository(AiCredential);
      const rows = await repo.find({ where: this.where(owner) });
      for (const row of rows) {
        const next = { ...(row.featureModels ?? {}) };
        const pinHere = target && row.provider === target.provider;
        if (pinHere) next[feature] = target.model;
        else delete next[feature];
        if (JSON.stringify(next) !== JSON.stringify(row.featureModels ?? {})) {
          await repo.update({ id: row.id }, { featureModels: next });
        }
      }
      await m.insert(ActivityLog, audit);
    });
  }

  private async deactivateAll(m: EntityManager, owner: AiKeyOwner): Promise<void> {
    await m.getRepository(AiCredential).update({ ...this.where(owner), isActive: true }, { isActive: false });
  }
}

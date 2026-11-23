// modules/subscription/repositories/subscription.repository.ts
import { In, type Repository } from "typeorm";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { PlanEntitlement } from "../entities/planEntitlement.entity";
import { OrganizationSubscription } from "../entities/organizationSubscription.entity";
import { SubscriptionPayment } from "../entities/subscriptionPayment.entity";
import type { PlanEntitlements, PlanKey } from "../domain/planCatalog";

export class SubscriptionRepository {
  static Instance = new SubscriptionRepository();

  private entitlements: Repository<PlanEntitlement>;
  private subscriptions: Repository<OrganizationSubscription>;
  private payments: Repository<SubscriptionPayment>;

  constructor() {
    this.entitlements = AppDataSource.getRepository(PlanEntitlement);
    this.subscriptions = AppDataSource.getRepository(OrganizationSubscription);
    this.payments = AppDataSource.getRepository(SubscriptionPayment);
  }

  // ── Plan entitlements ──────────────────────────────────────────────────────
  allEntitlements(): Promise<PlanEntitlement[]> {
    return this.entitlements.find();
  }

  async saveEntitlements(rows: Array<{ planKey: PlanKey } & PlanEntitlements>, updatedBy: string): Promise<void> {
    await this.entitlements.save(rows.map((r) => this.entitlements.create({ ...r, updatedBy })));
  }

  // ── Organisation subscriptions ─────────────────────────────────────────────
  findSubscription(organizationId: string): Promise<OrganizationSubscription | null> {
    return this.subscriptions.findOne({ where: { organizationId } });
  }

  findSubscriptions(organizationIds: string[]): Promise<OrganizationSubscription[]> {
    if (!organizationIds.length) return Promise.resolve([]);
    return this.subscriptions.find({ where: { organizationId: In(organizationIds) } });
  }

  async saveSubscription(row: Omit<OrganizationSubscription, "createdAt" | "updatedAt">): Promise<OrganizationSubscription> {
    await this.subscriptions.save(this.subscriptions.create(row));
    return (await this.findSubscription(row.organizationId)) as OrganizationSubscription;
  }

  // Back to Free: no row at all.
  async clearSubscription(organizationId: string): Promise<void> {
    await this.subscriptions.delete({ organizationId });
  }

  // ── Offline payments ───────────────────────────────────────────────────────
  async addPayment(row: Omit<SubscriptionPayment, "id" | "createdAt">): Promise<SubscriptionPayment> {
    return this.payments.save(this.payments.create(row));
  }

  listPayments(organizationId: string): Promise<SubscriptionPayment[]> {
    return this.payments.find({ where: { organizationId }, order: { paidAt: "DESC", createdAt: "DESC" }, take: 100 });
  }

  // Whether an organisation exists at all: there is no organisations table, so
  // it exists when someone belongs to it.
  async organizationExists(organizationId: string): Promise<boolean> {
    const rows = await AppDataSource.query(
      `SELECT 1 FROM "users" WHERE "organization_id" = $1 AND "deleted_at" IS NULL LIMIT 1`,
      [organizationId]
    );
    return rows.length > 0;
  }
}

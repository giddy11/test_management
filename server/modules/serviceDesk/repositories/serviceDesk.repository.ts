// modules/serviceDesk/repositories/serviceDesk.repository.ts
// Settings, the catalog, and the people pickers. Every query takes the
// organisation first — nothing here can reach across organisations.
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { ServiceDeskSettings } from "../entities/serviceDeskSettings.entity";
import { ServiceCatalogCategory } from "../entities/serviceCatalogCategory.entity";
import { ServiceCatalogItem } from "../entities/serviceCatalogItem.entity";
import type { DefaultCategory } from "../domain/defaultCatalog";

const { ActivityLog } = require("../../activity/entities/activityLog.entity");

export interface PersonRow {
  id: string;
  name: string;
  email: string;
  firstName: string;
}

const PERSON_COLUMNS = `u."id", TRIM(CONCAT(u."first_name", ' ', u."last_name")) AS "name", u."email", u."first_name" AS "firstName"`;

// Internal people only: an external client company's supporters belong to the
// testing side's support desk and never take part in IT requests.
const INTERNAL_USER = `u."organization_id" = $1 AND u."deleted_at" IS NULL AND u."client_company_id" IS NULL`;

export class ServiceDeskRepository {
  static Instance = new ServiceDeskRepository();

  // ── Settings ───────────────────────────────────────────────────────────────
  async getSettings(organizationId: string): Promise<ServiceDeskSettings | null> {
    return AppDataSource.getRepository(ServiceDeskSettings).findOne({ where: { organizationId } });
  }

  async saveSettings(organizationId: string, enabled: boolean, userId: string, audit: Record<string, unknown>) {
    return AppDataSource.transaction(async (m: EntityManager) => {
      await m.query(
        `INSERT INTO "service_desk_settings" ("organization_id", "enabled", "updated_by_id", "updated_at")
         VALUES ($1, $2, $3, now())
         ON CONFLICT ("organization_id") DO UPDATE
           SET "enabled" = EXCLUDED."enabled", "updated_by_id" = EXCLUDED."updated_by_id", "updated_at" = now()`,
        [organizationId, enabled, userId]
      );
      await m.insert(ActivityLog, audit);
      return m.getRepository(ServiceDeskSettings).findOneOrFail({ where: { organizationId } });
    });
  }

  // ── Catalog ────────────────────────────────────────────────────────────────
  async hasCatalog(organizationId: string): Promise<boolean> {
    const rows = await AppDataSource.query(
      `SELECT 1 FROM "service_catalog_categories" WHERE "organization_id" = $1 LIMIT 1`,
      [organizationId]
    );
    return rows.length > 0;
  }

  // Idempotent under a race: a category another request already seeded is
  // skipped (ON CONFLICT on organisation + key), and so are its items.
  async seedDefaults(organizationId: string, catalog: DefaultCategory[], createdById: string | null): Promise<void> {
    await AppDataSource.transaction(async (m: EntityManager) => {
      for (const [i, c] of catalog.entries()) {
        const inserted = await m.query(
          `INSERT INTO "service_catalog_categories" ("organization_id", "key", "name", "description", "icon", "sort_order")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT ("organization_id", "key") DO NOTHING
           RETURNING "id"`,
          [organizationId, c.key, c.name, c.description, c.icon, i]
        );
        if (!inserted.length) continue;
        for (const [j, item] of c.items.entries()) {
          await m.insert(ServiceCatalogItem, {
            organizationId,
            categoryId: inserted[0].id,
            name: item.name,
            description: item.description,
            formSchema: item.formSchema,
            approvalMode: item.approvalMode,
            approverIds: [],
            isActive: true,
            sortOrder: j,
            createdById,
          });
        }
      }
    });
  }

  async listCategories(organizationId: string, activeOnly: boolean): Promise<ServiceCatalogCategory[]> {
    return AppDataSource.getRepository(ServiceCatalogCategory).find({
      where: activeOnly ? { organizationId, isActive: true } : { organizationId },
      order: { sortOrder: "ASC", name: "ASC" },
    });
  }

  async listItems(organizationId: string, activeOnly: boolean): Promise<ServiceCatalogItem[]> {
    return AppDataSource.getRepository(ServiceCatalogItem).find({
      where: activeOnly ? { organizationId, isActive: true } : { organizationId },
      order: { sortOrder: "ASC", name: "ASC" },
    });
  }

  async findCategory(organizationId: string, id: string): Promise<ServiceCatalogCategory | null> {
    return AppDataSource.getRepository(ServiceCatalogCategory).findOne({ where: { organizationId, id } });
  }

  async findItem(organizationId: string, id: string): Promise<ServiceCatalogItem | null> {
    return AppDataSource.getRepository(ServiceCatalogItem).findOne({ where: { organizationId, id } });
  }

  async categoryKeyExists(organizationId: string, key: string): Promise<boolean> {
    const rows = await AppDataSource.query(
      `SELECT 1 FROM "service_catalog_categories" WHERE "organization_id" = $1 AND "key" = $2`,
      [organizationId, key]
    );
    return rows.length > 0;
  }

  async createCategory(row: Partial<ServiceCatalogCategory>, audit: Record<string, unknown>) {
    return AppDataSource.transaction(async (m: EntityManager) => {
      const saved = await m.getRepository(ServiceCatalogCategory).save(m.getRepository(ServiceCatalogCategory).create(row));
      await m.insert(ActivityLog, { ...audit, entityId: saved.id });
      return saved;
    });
  }

  async updateCategory(organizationId: string, id: string, patch: Partial<ServiceCatalogCategory>, audit: Record<string, unknown>) {
    return AppDataSource.transaction(async (m: EntityManager) => {
      await m.getRepository(ServiceCatalogCategory).update({ organizationId, id }, patch);
      await m.insert(ActivityLog, audit);
      return m.getRepository(ServiceCatalogCategory).findOneOrFail({ where: { organizationId, id } });
    });
  }

  async createItem(row: Partial<ServiceCatalogItem>, audit: Record<string, unknown>) {
    return AppDataSource.transaction(async (m: EntityManager) => {
      const saved = await m.getRepository(ServiceCatalogItem).save(m.getRepository(ServiceCatalogItem).create(row));
      await m.insert(ActivityLog, { ...audit, entityId: saved.id });
      return saved;
    });
  }

  // Every edit bumps the version, so a request's snapshot says which edition
  // of the item it was raised against.
  async updateItem(organizationId: string, id: string, patch: Partial<ServiceCatalogItem>, audits: Record<string, unknown>[]) {
    return AppDataSource.transaction(async (m: EntityManager) => {
      await m
        .createQueryBuilder()
        .update(ServiceCatalogItem)
        .set({ ...patch, version: () => `"version" + 1` } as never)
        .where(`"organization_id" = :organizationId AND "id" = :id`, { organizationId, id })
        .execute();
      for (const audit of audits) await m.insert(ActivityLog, audit);
      return m.getRepository(ServiceCatalogItem).findOneOrFail({ where: { organizationId, id } });
    });
  }

  // ── People ─────────────────────────────────────────────────────────────────

  // Internal people holding any of `codes` (directly, or through the wildcard).
  async usersWithPermission(organizationId: string, codes: string[]): Promise<PersonRow[]> {
    return AppDataSource.query(
      `SELECT ${PERSON_COLUMNS}
         FROM "users" u
        WHERE ${INTERNAL_USER}
          AND EXISTS (
            SELECT 1 FROM "user_roles" ur
              JOIN "role_permissions" rp ON rp."role_id" = ur."role_id"
             WHERE ur."user_id" = u."id" AND rp."permission_code" = ANY($2::varchar[])
          )
        ORDER BY "name" ASC`,
      [organizationId, [...codes, "*"]]
    );
  }

  // Colleagues for the "requested for" picker.
  async internalPeople(organizationId: string, search: string | undefined, limit = 20): Promise<PersonRow[]> {
    const params: unknown[] = [organizationId];
    let where = INTERNAL_USER;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (CONCAT(u."first_name", ' ', u."last_name") ILIKE $2 OR u."email" ILIKE $2)`;
    }
    params.push(limit);
    return AppDataSource.query(
      `SELECT ${PERSON_COLUMNS} FROM "users" u WHERE ${where} ORDER BY "name" ASC LIMIT $${params.length}`,
      params
    );
  }

  async peopleByIds(organizationId: string, ids: string[]): Promise<PersonRow[]> {
    if (!ids.length) return [];
    return AppDataSource.query(
      `SELECT ${PERSON_COLUMNS} FROM "users" u WHERE ${INTERNAL_USER} AND u."id" = ANY($2::uuid[])`,
      [organizationId, ids]
    );
  }
}

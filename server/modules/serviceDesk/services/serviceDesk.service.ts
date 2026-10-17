// modules/serviceDesk/services/serviceDesk.service.ts
// The module switch, the catalog, and the people pickers.
//
// IT requests is a module of its own: this file and its siblings import only
// shared platform code (access, activity, notification, users) — never a
// testing module. See docs/it-service-requests-plan.md §0.
import { ServiceDeskRepository, type PersonRow } from "../repositories/serviceDesk.repository";
import { DEFAULT_CATALOG } from "../domain/defaultCatalog";
import type { ServiceCatalogItem } from "../entities/serviceCatalogItem.entity";
import type { CreateCategoryBody, CreateItemBody, UpdateCategoryBody, UpdateItemBody } from "../validators/serviceDesk.schema";
import { toAdminItemDto, toCategoryDto, toPersonDto, toPortalItemDto } from "../dto/serviceDesk.dto";
import type { Actor } from "../../../shared/types/actor";

const { AppError } = require("../../../shared/errors/AppError");
const { can } = require("../../../shared/access/can");
const { isExternalSupporter } = require("../../../shared/access/scope");
const { ActivityService } = require("../../activity/services/activity.service");

// What req.user actually carries (see auth.middleware + permissions.middleware).
export type DeskActor = Actor & {
  permissions?: Set<string> | string[];
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
};

export const PERMS = {
  CREATE: "servicerequest.create",
  WORK: "servicedesk.work",
  MANAGE: "servicedesk.manage",
} as const;

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "category";

export class ServiceDeskService {
  static Instance = new ServiceDeskService();

  constructor(
    private readonly repo = ServiceDeskRepository.Instance,
    private readonly activity = ActivityService.Instance
  ) {}

  // Every IT-requests call is about the caller's own organisation, and only
  // internal people take part — an external supporter is turned away even if
  // a custom role handed them one of these permissions.
  orgOf(actor: DeskActor): string {
    if (!actor.organizationId || isExternalSupporter(actor)) {
      throw new AppError("You do not have permission to do this", 403);
    }
    return actor.organizationId;
  }

  async isEnabled(organizationId: string): Promise<boolean> {
    return (await this.repo.getSettings(organizationId))?.enabled ?? false;
  }

  async assertEnabled(organizationId: string): Promise<void> {
    if (!(await this.isEnabled(organizationId))) {
      throw new AppError("IT requests is not turned on for your organisation", 403, [], { reason: "disabled" });
    }
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  async getSettings(actor: DeskActor) {
    const organizationId = this.orgOf(actor);
    return { enabled: await this.isEnabled(organizationId) };
  }

  async updateSettings(actor: DeskActor, enabled: boolean) {
    const organizationId = this.orgOf(actor);
    // Turning it on with an empty catalog would greet everyone with nothing.
    if (enabled) await this.ensureCatalog(organizationId, actor.id);
    const saved = await this.repo.saveSettings(
      organizationId,
      enabled,
      actor.id,
      this.activity.buildEntry(actor, {
        action: "service_desk.settings_updated",
        summary: `${enabled ? "Turned on" : "Turned off"} IT requests`,
        entityType: "service_desk",
        metadata: { enabled },
      })
    );
    return { enabled: saved.enabled };
  }

  // ── Catalog ────────────────────────────────────────────────────────────────
  private async ensureCatalog(organizationId: string, actorId: string | null): Promise<void> {
    if (!(await this.repo.hasCatalog(organizationId))) {
      await this.repo.seedDefaults(organizationId, DEFAULT_CATALOG, actorId);
    }
  }

  // The request portal: active categories that have at least one active item.
  async portalCatalog(actor: DeskActor) {
    const organizationId = this.orgOf(actor);
    await this.assertEnabled(organizationId);
    await this.ensureCatalog(organizationId, null);
    const [categories, items] = await Promise.all([
      this.repo.listCategories(organizationId, true),
      this.repo.listItems(organizationId, true),
    ]);
    return categories
      .map((c) => ({
        ...toCategoryDto(c),
        items: items.filter((i) => i.categoryId === c.id).map(toPortalItemDto),
      }))
      .filter((c) => c.items.length > 0);
  }

  // Catalog setup: everything, switched off or not, with approvers named.
  async adminCatalog(actor: DeskActor) {
    const organizationId = this.orgOf(actor);
    await this.ensureCatalog(organizationId, actor.id);
    const [categories, items] = await Promise.all([
      this.repo.listCategories(organizationId, false),
      this.repo.listItems(organizationId, false),
    ]);
    const people = await this.peopleMap(organizationId, items.flatMap((i) => i.approverIds ?? []));
    return categories.map((c) => ({
      ...toCategoryDto(c),
      items: items.filter((i) => i.categoryId === c.id).map((i) => toAdminItemDto(i, people)),
    }));
  }

  async createCategory(actor: DeskActor, body: CreateCategoryBody) {
    const organizationId = this.orgOf(actor);
    let key = slug(body.name);
    for (let n = 2; await this.repo.categoryKeyExists(organizationId, key); n++) key = `${slug(body.name)}_${n}`;
    const saved = await this.repo.createCategory(
      {
        organizationId,
        key,
        name: body.name,
        description: body.description,
        icon: body.icon,
        sortOrder: body.sortOrder ?? 100,
        isActive: true,
      },
      this.activity.buildEntry(actor, {
        action: "service_catalog.category_created",
        summary: `Added the IT-request category "${body.name}"`,
        entityType: "service_catalog_category",
      })
    );
    return toCategoryDto(saved);
  }

  async updateCategory(actor: DeskActor, id: string, body: UpdateCategoryBody) {
    const organizationId = this.orgOf(actor);
    const existing = await this.repo.findCategory(organizationId, id);
    if (!existing) throw new AppError("Category not found", 404);
    const saved = await this.repo.updateCategory(
      organizationId,
      id,
      body,
      this.activity.buildEntry(actor, {
        action: "service_catalog.category_updated",
        summary: `Updated the IT-request category "${body.name ?? existing.name}"`,
        entityType: "service_catalog_category",
        entityId: id,
        metadata: { changed: Object.keys(body) },
      })
    );
    return toCategoryDto(saved);
  }

  async createItem(actor: DeskActor, body: CreateItemBody) {
    const organizationId = this.orgOf(actor);
    if (!(await this.repo.findCategory(organizationId, body.categoryId))) throw new AppError("Category not found", 404);
    const approverIds = await this.validApprovers(organizationId, body.approverIds);
    const saved = await this.repo.createItem(
      {
        organizationId,
        categoryId: body.categoryId,
        name: body.name,
        description: body.description,
        formSchema: body.formSchema,
        approvalMode: body.approvalMode,
        approverIds,
        fulfilmentNotes: body.fulfilmentNotes,
        isActive: body.isActive,
        sortOrder: body.sortOrder ?? 100,
        createdById: actor.id,
      },
      this.activity.buildEntry(actor, {
        action: "service_catalog.item_created",
        summary: `Added "${body.name}" to the IT-request catalog`,
        entityType: "service_catalog_item",
        metadata: { approvalMode: body.approvalMode, approverIds },
      })
    );
    return toAdminItemDto(saved, await this.peopleMap(organizationId, saved.approverIds));
  }

  async updateItem(actor: DeskActor, id: string, body: UpdateItemBody) {
    const organizationId = this.orgOf(actor);
    const existing = await this.repo.findItem(organizationId, id);
    if (!existing) throw new AppError("Catalog item not found", 404);
    if (body.categoryId && !(await this.repo.findCategory(organizationId, body.categoryId))) {
      throw new AppError("Category not found", 404);
    }
    const patch: Partial<ServiceCatalogItem> = { ...body };
    if (body.approverIds) patch.approverIds = await this.validApprovers(organizationId, body.approverIds);

    // Who approves is the security-relevant part of an item, so a change to it
    // gets its own (warning-level) entry rather than hiding in "updated".
    const approversChanged =
      (patch.approvalMode !== undefined && patch.approvalMode !== existing.approvalMode) ||
      (patch.approverIds !== undefined && !sameSet(patch.approverIds, existing.approverIds ?? []));
    const audits = [
      this.activity.buildEntry(actor, {
        action: "service_catalog.item_updated",
        summary: `Updated "${body.name ?? existing.name}" in the IT-request catalog`,
        entityType: "service_catalog_item",
        entityId: id,
        metadata: { changed: Object.keys(body) },
      }),
    ];
    if (approversChanged) {
      audits.push(
        this.activity.buildEntry(actor, {
          action: "service_catalog.item_approvers_changed",
          summary: `Changed who approves "${body.name ?? existing.name}"`,
          entityType: "service_catalog_item",
          entityId: id,
          metadata: {
            from: { approvalMode: existing.approvalMode, approverIds: existing.approverIds },
            to: { approvalMode: patch.approvalMode ?? existing.approvalMode, approverIds: patch.approverIds ?? existing.approverIds },
          },
        })
      );
    }
    const saved = await this.repo.updateItem(organizationId, id, patch, audits);
    return toAdminItemDto(saved, await this.peopleMap(organizationId, saved.approverIds));
  }

  // An approver must be an internal colleague who can reach the approvals
  // routes at all (see serviceDesk.routes: servicerequest.create or
  // servicedesk.manage).
  private async validApprovers(organizationId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const eligible = new Set(
      (await this.repo.usersWithPermission(organizationId, [PERMS.CREATE, PERMS.MANAGE])).map((p) => p.id)
    );
    const unknown = ids.filter((id) => !eligible.has(id));
    if (unknown.length) {
      throw new AppError("Every approver must be a colleague who can use IT requests", 422, [
        { field: "approverIds", message: "Pick approvers from the list" },
      ]);
    }
    return ids;
  }

  private async peopleMap(organizationId: string, ids: string[]): Promise<Map<string, PersonRow>> {
    const rows = await this.repo.peopleByIds(organizationId, [...new Set(ids)]);
    return new Map(rows.map((p) => [p.id, p]));
  }

  // ── People pickers ─────────────────────────────────────────────────────────
  async approverCandidates(actor: DeskActor) {
    const organizationId = this.orgOf(actor);
    return (await this.repo.usersWithPermission(organizationId, [PERMS.CREATE, PERMS.MANAGE])).map(toPersonDto);
  }

  async agents(actor: DeskActor) {
    const organizationId = this.orgOf(actor);
    return (await this.repo.usersWithPermission(organizationId, [PERMS.WORK])).map(toPersonDto);
  }

  async colleagues(actor: DeskActor, search?: string) {
    const organizationId = this.orgOf(actor);
    await this.assertEnabled(organizationId);
    return (await this.repo.internalPeople(organizationId, search)).map(toPersonDto);
  }

  canWork(actor: DeskActor): boolean {
    return can(actor, PERMS.WORK);
  }

  canManage(actor: DeskActor): boolean {
    return can(actor, PERMS.MANAGE);
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

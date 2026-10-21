// modules/serviceDesk/services/serviceDesk.service.ts
// The module switch, the catalog, and the people pickers.
//
// IT requests is a module of its own: this file and its siblings import only
// shared platform code (access, activity, notification, users) — never a
// testing module. See docs/it-service-requests-plan.md §0.
import { ServiceDeskRepository, type ApprovalRulesPatch, type PersonRow } from "../repositories/serviceDesk.repository";
import { DEFAULT_CATALOG } from "../domain/defaultCatalog";
import { DEFAULT_SERVICE_LEVELS, type ServiceLevels } from "../domain/serviceLevels";
import { ApprovalSetupRepository } from "../repositories/approvalSetup.repository";
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
    private readonly activity = ActivityService.Instance,
    private readonly approvalRepo = ApprovalSetupRepository.Instance
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

  // The organisation's service levels, or the defaults when never set.
  async serviceLevels(organizationId: string): Promise<ServiceLevels> {
    const s = await this.repo.getSettings(organizationId);
    if (!s) return DEFAULT_SERVICE_LEVELS;
    return {
      approvalHours: s.approvalHours ?? DEFAULT_SERVICE_LEVELS.approvalHours,
      fulfilmentHours: { ...DEFAULT_SERVICE_LEVELS.fulfilmentHours, ...(s.fulfilmentHours ?? {}) },
      escalation: { ...DEFAULT_SERVICE_LEVELS.escalation, ...(s.escalation ?? {}) },
    };
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  async getSettings(actor: DeskActor) {
    const organizationId = this.orgOf(actor);
    const [enabled, serviceLevels, agentsCannotApprove, requireLineManager] = await Promise.all([
      this.isEnabled(organizationId),
      this.serviceLevels(organizationId),
      this.agentsCannotApprove(organizationId),
      this.requireLineManager(organizationId),
    ]);
    return { enabled, serviceLevels, agentsCannotApprove, requireLineManager };
  }

  // Must a request that needs a line manager have one to be submitted? On by default.
  async requireLineManager(organizationId: string): Promise<boolean> {
    return (await this.repo.getSettings(organizationId))?.requireLineManager ?? true;
  }

  // The organisation's "IT agents can't approve" switch.
  async agentsCannotApprove(organizationId: string): Promise<boolean> {
    // No settings row yet means the default, which is on.
    return (await this.repo.getSettings(organizationId))?.agentsCannotApprove ?? true;
  }

  // Who may not be named as an approver, or routed one, right now: the IT
  // agents while the switch is on (it is by default), nobody once it is off.
  async blockedApproverIds(organizationId: string): Promise<Set<string>> {
    return (await this.agentsCannotApprove(organizationId)) ? this.repo.queueOnlyAgentIds(organizationId) : new Set();
  }

  async updateApprovalRules(actor: DeskActor, rules: ApprovalRulesPatch) {
    const organizationId = this.orgOf(actor);
    const said: string[] = [];
    if (rules.agentsCannotApprove !== undefined) {
      said.push(`${rules.agentsCannotApprove ? "Stopped" : "Allowed"} IT agents approving IT requests`);
    }
    if (rules.requireLineManager !== undefined) {
      said.push(`${rules.requireLineManager ? "Required" : "No longer required"} a line manager to submit a request that needs one`);
    }
    await this.repo.saveApprovalRules(
      organizationId,
      rules,
      actor.id,
      this.activity.buildEntry(actor, {
        action: "service_desk.settings_updated",
        summary: said.join("; ") || "Changed IT-request approval rules",
        entityType: "service_desk",
        severity: "warning",
        metadata: { ...rules },
      })
    );
    return this.getSettings(actor);
  }

  async updateServiceLevels(actor: DeskActor, levels: ServiceLevels) {
    const organizationId = this.orgOf(actor);
    if (levels.escalation.contactIds.length) {
      const pool = new Set((await this.repo.usersWithPermission(organizationId, [PERMS.CREATE, PERMS.WORK, PERMS.MANAGE])).map((p) => p.id));
      if (levels.escalation.contactIds.some((id) => !pool.has(id))) {
        throw new AppError("Escalation contacts must be colleagues who use IT requests", 422, [
          { field: "escalation.contactIds", message: "Pick contacts from the list" },
        ]);
      }
    }
    await this.repo.saveServiceLevels(
      organizationId,
      levels,
      actor.id,
      this.activity.buildEntry(actor, {
        action: "service_desk.settings_updated",
        summary: "Changed IT-request service levels and escalation",
        entityType: "service_desk",
        metadata: levels,
      })
    );
    return this.getSettings(actor);
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
    return {
      enabled: saved.enabled,
      serviceLevels: await this.serviceLevels(organizationId),
      agentsCannotApprove: saved.agentsCannotApprove ?? true,
      requireLineManager: saved.requireLineManager ?? true,
    };
  }

  // ── Catalog ────────────────────────────────────────────────────────────────
  // Seeds the starter catalog the first time only. An organisation that has
  // since deleted every category keeps its empty catalog.
  private async ensureCatalog(organizationId: string, actorId: string | null): Promise<void> {
    if ((await this.repo.getSettings(organizationId))?.catalogSeeded) return;
    if (!(await this.repo.hasCatalog(organizationId))) {
      await this.repo.seedDefaults(organizationId, DEFAULT_CATALOG, actorId);
    }
    await this.repo.markCatalogSeeded(organizationId);
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
    const [people, policies] = await Promise.all([
      this.peopleMap(organizationId, items.flatMap((i) => i.approverIds ?? [])),
      this.approvalRepo.listPolicies(organizationId),
    ]);
    const policyName = new Map(policies.map((p) => [p.id, p.name]));
    return categories.map((c) => ({
      ...toCategoryDto(c),
      items: items
        .filter((i) => i.categoryId === c.id)
        .map((i) => toAdminItemDto(i, people, i.approvalPolicyId ? policyName.get(i.approvalPolicyId) ?? null : null)),
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
    const approvalPolicyId = await this.validPolicy(organizationId, body.approvalMode, body.approvalPolicyId);
    const saved = await this.repo.createItem(
      {
        organizationId,
        categoryId: body.categoryId,
        name: body.name,
        description: body.description,
        formSchema: body.formSchema,
        approvalMode: body.approvalMode,
        approverIds,
        approvalPolicyId,
        riskLevel: body.riskLevel,
        approvalHours: body.approvalHours,
        fulfilmentHours: body.fulfilmentHours,
        requiresIdentityCheck: body.requiresIdentityCheck,
        fulfilmentNotes: body.fulfilmentNotes,
        isActive: body.isActive,
        sortOrder: body.sortOrder ?? 100,
        createdById: actor.id,
      },
      this.activity.buildEntry(actor, {
        action: "service_catalog.item_created",
        summary: `Added "${body.name}" to the IT-request catalog`,
        entityType: "service_catalog_item",
        metadata: { approvalMode: body.approvalMode, approverIds, approvalPolicyId, riskLevel: body.riskLevel },
      })
    );
    return this.adminItem(organizationId, saved);
  }

  // A policy is required in "policy" mode and meaningless otherwise.
  private async validPolicy(organizationId: string, mode: string, policyId: string | null | undefined): Promise<string | null> {
    if (mode !== "policy") return null;
    if (!policyId || !(await this.approvalRepo.findPolicy(organizationId, policyId))) {
      throw new AppError("Pick the approval policy this item follows", 422, [
        { field: "approvalPolicyId", message: "Pick a policy from the list" },
      ]);
    }
    return policyId;
  }

  private async adminItem(organizationId: string, item: ServiceCatalogItem) {
    const policy = item.approvalPolicyId ? await this.approvalRepo.findPolicy(organizationId, item.approvalPolicyId) : null;
    return toAdminItemDto(item, await this.peopleMap(organizationId, item.approverIds), policy?.name ?? null);
  }

  // Only something nobody ever requested can be deleted; anything else is
  // hidden instead, so the requests raised against it keep their history.
  async deleteItem(actor: DeskActor, id: string) {
    const organizationId = this.orgOf(actor);
    const existing = await this.repo.findItem(organizationId, id);
    if (!existing) throw new AppError("Catalog item not found", 404);
    const blockedBy = await this.repo.deleteItemIfUnused(
      organizationId,
      id,
      this.activity.buildEntry(actor, {
        action: "service_catalog.item_deleted",
        summary: `Deleted "${existing.name}" from the IT-request catalog`,
        entityType: "service_catalog_item",
        entityId: id,
        severity: "warning",
      })
    );
    if (blockedBy > 0) {
      throw new AppError(
        `${blockedBy} request${blockedBy === 1 ? " was" : "s were"} raised for "${existing.name}". Hide it instead, so their history stays intact.`,
        409
      );
    }
  }

  async deleteCategory(actor: DeskActor, id: string) {
    const organizationId = this.orgOf(actor);
    const existing = await this.repo.findCategory(organizationId, id);
    if (!existing) throw new AppError("Category not found", 404);
    const { blockedBy } = await this.repo.deleteCategoryIfUnused(
      organizationId,
      id,
      this.activity.buildEntry(actor, {
        action: "service_catalog.category_deleted",
        summary: `Deleted the IT-request category "${existing.name}"`,
        entityType: "service_catalog_category",
        entityId: id,
        severity: "warning",
      })
    );
    if (blockedBy > 0) {
      throw new AppError(
        `${blockedBy} request${blockedBy === 1 ? " was" : "s were"} raised for items in "${existing.name}". Hide the category instead, so their history stays intact.`,
        409
      );
    }
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
    const mode = body.approvalMode ?? existing.approvalMode;
    if (body.approvalMode !== undefined || body.approvalPolicyId !== undefined) {
      patch.approvalPolicyId = await this.validPolicy(
        organizationId,
        mode,
        body.approvalPolicyId !== undefined ? body.approvalPolicyId : existing.approvalPolicyId
      );
    }

    // Who approves is the security-relevant part of an item, so a change to it
    // gets its own (warning-level) entry rather than hiding in "updated".
    const approversChanged =
      (patch.approvalMode !== undefined && patch.approvalMode !== existing.approvalMode) ||
      (patch.approverIds !== undefined && !sameSet(patch.approverIds, existing.approverIds ?? [])) ||
      (patch.approvalPolicyId !== undefined && patch.approvalPolicyId !== existing.approvalPolicyId) ||
      (patch.riskLevel !== undefined && patch.riskLevel !== existing.riskLevel) ||
      (patch.requiresIdentityCheck !== undefined && patch.requiresIdentityCheck !== existing.requiresIdentityCheck);
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
            from: {
              approvalMode: existing.approvalMode,
              approverIds: existing.approverIds,
              approvalPolicyId: existing.approvalPolicyId,
              riskLevel: existing.riskLevel,
            },
            to: {
              approvalMode: patch.approvalMode ?? existing.approvalMode,
              approverIds: patch.approverIds ?? existing.approverIds,
              approvalPolicyId: patch.approvalPolicyId !== undefined ? patch.approvalPolicyId : existing.approvalPolicyId,
              riskLevel: patch.riskLevel ?? existing.riskLevel,
            },
          },
        })
      );
    }
    const saved = await this.repo.updateItem(organizationId, id, patch, audits);
    return this.adminItem(organizationId, saved);
  }

  // An approver must be an internal colleague who can reach the approvals
  // routes at all (see serviceDesk.routes: servicerequest.create or
  // servicedesk.manage).
  private async validApprovers(organizationId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const [people, blocked] = await Promise.all([
      this.repo.usersWithPermission(organizationId, [PERMS.CREATE, PERMS.MANAGE]),
      this.blockedApproverIds(organizationId),
    ]);
    const eligible = new Set(people.map((p) => p.id));
    if (ids.some((id) => !eligible.has(id))) {
      throw new AppError("Every approver must be a colleague who can use IT requests", 422, [
        { field: "approverIds", message: "Pick approvers from the list" },
      ]);
    }
    const agents = people.filter((p) => ids.includes(p.id) && blocked.has(p.id)).map((p) => p.name || p.email);
    if (agents.length) {
      throw new AppError(`${agents.join(", ")} ${agents.length === 1 ? "is an IT agent" : "are IT agents"}, and IT agents can't approve requests (see Approval policies)`, 422, [
        { field: "approverIds", message: "Remove the IT agents from the approvers" },
      ]);
    }
    return ids;
  }

  private async peopleMap(organizationId: string, ids: string[]): Promise<Map<string, PersonRow>> {
    const rows = await this.repo.peopleByIds(organizationId, [...new Set(ids)]);
    return new Map(rows.map((p) => [p.id, p]));
  }

  // ── People pickers ─────────────────────────────────────────────────────────
  // Everyone who could approve by permission. `blocked` marks IT agents the
  // organisation keeps out of approvals: the pickers hide them, and a policy or
  // group that already names one shows a notice instead of "unknown person".
  async approverCandidates(actor: DeskActor) {
    const organizationId = this.orgOf(actor);
    const [people, blocked] = await Promise.all([
      this.repo.usersWithPermission(organizationId, [PERMS.CREATE, PERMS.MANAGE]),
      this.blockedApproverIds(organizationId),
    ]);
    return people.map((p) => ({ ...toPersonDto(p), blocked: blocked.has(p.id) }));
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

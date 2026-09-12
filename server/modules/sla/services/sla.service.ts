// modules/sla/services/sla.service.ts
// SLA tracking over feedback tickets: resolves who the caller may see,
// loads the organisation's SLA rules (or defaults), and composes the
// dashboard payload from the repository's aggregate queries.
//
// Definitions (all measured from ticket creation, per the business rules):
//   First response  → first staff comment or first stage past "logged", on
//                     either the IT or product tier — whichever came first.
//   Resolution      → IT tier resolved locally, or product tier "resolved".
//   Paused          → time in any stage listed in the org's pausedStatuses
//                     doesn't count toward resolution.
//   Breach          → measured (or, for open tickets, live) time exceeds the
//                     target for the ticket's severity. Identified at query
//                     time, so no batch job is needed.
import { SlaRepository, type SlaRules, type SlaScope } from "../repositories/sla.repository";
import type { SlaTargets } from "../entities/slaSettings.entity";
import type { SlaFilters, SlaTicketsQuery, UpdateSlaSettingsBody } from "../validators/sla.schema";
import type { Actor } from "../../../shared/types/actor";

const { AppError } = require("../../../shared/errors/AppError");
const { UserRole } = require("../../../config/constants");
const { ActivityService } = require("../../activity/services/activity.service");

// Applied when an organisation hasn't configured its own rules. Hours.
export const DEFAULT_SLA_TARGETS: SlaTargets = Object.freeze({
  critical: { firstResponseHours: 1, resolutionHours: 24 },
  high: { firstResponseHours: 4, resolutionHours: 72 },
  medium: { firstResponseHours: 8, resolutionHours: 120 },
  low: { firstResponseHours: 24, resolutionHours: 240 },
  // Tickets without a severity (direct submissions, or not yet escalated).
  default: { firstResponseHours: 24, resolutionHours: 120 },
}) as SlaTargets;

export class SlaService {
  static Instance = new SlaService();

  constructor(private readonly repo: SlaRepository = SlaRepository.Instance) {}

  // Only these roles reach the routes (see sla.routes.ts); this narrows each
  // one to the tickets it's entitled to see.
  private scopeFor(actor: Actor): SlaScope {
    if (actor.role === UserRole.IT_SUPPORT) {
      if (!actor.clientCompanyId) throw new AppError("No client company on this account", 403);
      return { clientCompanyId: actor.clientCompanyId };
    }
    if (!actor.organizationId) throw new AppError("No organisation on this account", 403);
    if (actor.role === UserRole.USER) {
      return { organizationId: actor.organizationId, memberUserId: actor.id };
    }
    return { organizationId: actor.organizationId };
  }

  // Filters the caller isn't allowed to broaden are dropped rather than
  // rejected — a supporter passing clientCompanyId can only ever mean their own.
  private filtersFor(actor: Actor, filters: SlaFilters | SlaTicketsQuery) {
    const { interval: _iv, metric: _m, sort: _s, page: _p, limit: _l, ...rest } = filters as SlaTicketsQuery & { interval?: string };
    if (actor.role === UserRole.IT_SUPPORT) delete rest.clientCompanyId;
    return rest;
  }

  private async rulesFor(actor: Actor): Promise<SlaRules & { isDefault: boolean; updatedAt: Date | null }> {
    const settings = actor.organizationId ? await this.repo.findSettings(actor.organizationId) : null;
    return {
      // Merge so a partially-configured row still has every severity key —
      // the SQL indexes targets by severity and must never hit a null.
      targets: { ...DEFAULT_SLA_TARGETS, ...(settings?.targets ?? {}) },
      pausedStatuses: settings?.pausedStatuses ?? [],
      isDefault: !settings,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async getSettings(actor: Actor) {
    const rules = await this.rulesFor(actor);
    return {
      targets: rules.targets,
      pausedStatuses: rules.pausedStatuses,
      isDefault: rules.isDefault,
      updatedAt: rules.updatedAt,
      canEdit: actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN,
    };
  }

  async updateSettings(actor: Actor, body: UpdateSlaSettingsBody) {
    if (!actor.organizationId) throw new AppError("No organisation on this account", 403);
    const saved = await this.repo.saveSettings({
      organizationId: actor.organizationId,
      targets: body.targets,
      pausedStatuses: [...new Set(body.pausedStatuses)],
      updatedById: actor.id,
    });

    ActivityService.Instance.log(actor, {
      action: "sla.settings_updated",
      summary: "Updated the organisation's SLA rules",
      entityType: "sla_settings",
      entityId: actor.organizationId,
      metadata: { targets: body.targets, pausedStatuses: body.pausedStatuses },
    });

    return {
      targets: saved.targets,
      pausedStatuses: saved.pausedStatuses,
      isDefault: false,
      updatedAt: saved.updatedAt,
      canEdit: true,
    };
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  async overview(actor: Actor, query: SlaFilters) {
    const scope = this.scopeFor(actor);
    const filters = this.filtersFor(actor, query);
    const rules = await this.rulesFor(actor);
    const interval = query.interval ?? pickInterval(query.from, query.to);

    const [kpis, overTime, bySeverity, byStatus, byType, byProject, byAssignee, bySupporter, recurring] =
      await Promise.all([
        this.repo.kpis(scope, filters, rules),
        this.repo.overTime(scope, filters, rules, interval),
        this.repo.bySeverity(scope, filters, rules),
        this.repo.byStage(scope, filters, rules),
        this.repo.byType(scope, filters, rules),
        this.repo.byProject(scope, filters, rules),
        this.repo.byAssignee(scope, filters, rules),
        this.repo.bySupporter(scope, filters, rules),
        this.repo.recurring(scope, filters, rules),
      ]);

    const judged = kpis.slaMet + kpis.slaBreached;
    return {
      interval,
      rules: { targets: rules.targets, pausedStatuses: rules.pausedStatuses, isDefault: rules.isDefault },
      kpis: {
        ...numeric(kpis),
        // Compliance rates exclude tickets still within target (nothing to
        // judge yet) so a fresh queue doesn't read as 100% compliant.
        firstResponseRate: rate(kpis.firstResponseMet, kpis.firstResponseMet + kpis.firstResponseBreached),
        resolutionRate: rate(kpis.resolutionMet, kpis.resolutionMet + kpis.resolutionBreached),
        complianceRate: rate(kpis.slaMet, judged),
      },
      overTime: overTime.map(numeric),
      bySeverity: orderSeverity(bySeverity.map(numeric)),
      byStatus: byStatus.map(numeric),
      byType: byType.map(numeric),
      byProject: byProject.map(numeric),
      byAssignee: byAssignee.map(numeric),
      bySupporter: bySupporter.map(numeric),
      recurring: recurring.map(numeric),
    };
  }

  async tickets(actor: Actor, query: SlaTicketsQuery) {
    const scope = this.scopeFor(actor);
    const filters = this.filtersFor(actor, query);
    const rules = await this.rulesFor(actor);
    const { data, meta } = await this.repo.tickets(scope, filters, rules, {
      metric: query.metric,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    });
    const canOpen = actor.role !== UserRole.IT_SUPPORT;
    return {
      data: data.map((row: Record<string, unknown>) => ({
        ...numeric(row),
        assignees: row.assignees ?? [],
        // The product-org triage list hides company tickets until IT support
        // escalates them, so the drill-down can't deep-link those yet.
        visibleInTriage: canOpen
          ? !row.clientCompanyId || row.supportStatus === "escalated"
          : true,
      })),
      meta,
    };
  }

  async filterOptions(actor: Actor) {
    const scope = this.scopeFor(actor);
    const rules = await this.rulesFor(actor);
    return this.repo.filterOptions(scope, rules);
  }
}

// pg returns bigint/numeric aggregates as strings — coerce anything that
// looks numeric so the client gets numbers.
function numeric<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  return out as T;
}

function rate(met: number, judged: number): number | null {
  return judged > 0 ? Math.round((met / judged) * 1000) / 10 : null;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "unset"];
function orderSeverity<T extends { severity: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

// Daily buckets for short ranges, weekly for a few months, monthly beyond.
export function pickInterval(from?: string, to?: string): "day" | "week" | "month" {
  if (!from) return "month";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const days = (end - start) / 86_400_000;
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  return "month";
}

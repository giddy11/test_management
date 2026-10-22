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
import type { SlaEscalationRules, SlaSettings, SlaTarget, SlaTargets } from "../entities/slaSettings.entity";
import type { SlaFilters, SlaTicketsQuery, UpdateSlaSettingsBody } from "../validators/sla.schema";
import type { Actor } from "../../../shared/types/actor";

const { AppError } = require("../../../shared/errors/AppError");
const { can } = require("../../../shared/access/can");
const {
  isExternalSupporter,
  isOrphanedSupporter,
  seesAllProjects,
} = require("../../../shared/access/scope");
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

// Escalation is opt-in: until an administrator turns it on, nothing is sent.
export const DEFAULT_SLA_ESCALATION: SlaEscalationRules = Object.freeze({
  enabled: false,
  level2Pct: 50,
  level3Pct: 100,
  contactIds: [],
}) as SlaEscalationRules;

export class SlaService {
  static Instance = new SlaService();

  constructor(private readonly repo: SlaRepository = SlaRepository.Instance) {}

  // Only these roles reach the routes (see sla.routes.ts); this narrows each
  // one to the tickets it's entitled to see.
  private scopeFor(actor: Actor): SlaScope {
    if (isExternalSupporter(actor)) {
      return { clientCompanyId: actor.clientCompanyId as string };
    }
    // A supporter account with no company attached is denied outright rather
    // than falling through to the organisation scope below.
    if (isOrphanedSupporter(actor)) {
      throw new AppError("No client company on this account", 403);
    }
    if (!actor.organizationId) throw new AppError("No organisation on this account", 403);
    if (!seesAllProjects(actor)) {
      return { organizationId: actor.organizationId, memberUserId: actor.id };
    }
    return { organizationId: actor.organizationId };
  }

  // Filters the caller isn't allowed to broaden are dropped rather than
  // rejected — a supporter passing clientCompanyId can only ever mean their own.
  private filtersFor(actor: Actor, filters: SlaFilters | SlaTicketsQuery) {
    const { interval: _iv, metric: _m, sort: _s, page: _p, limit: _l, ...rest } = filters as SlaTicketsQuery & { interval?: string };
    if (isExternalSupporter(actor)) delete rest.clientCompanyId;
    return rest;
  }

  private async rulesFor(actor: Actor): Promise<SlaRules & { isDefault: boolean; updatedAt: Date | null } & ResolvedTargets> {
    const settings = actor.organizationId ? await this.repo.findSettings(actor.organizationId) : null;
    const resolved = resolveTargets(settings);
    return {
      targets: resolved.targets,
      bugTargets: resolved.bugTargets,
      featureRequestTarget: resolved.featureRequestTarget,
      separateBugTargets: resolved.separateBugTargets,
      separateFeatureRequestTarget: resolved.separateFeatureRequestTarget,
      pausedStatuses: settings?.pausedStatuses ?? [],
      isDefault: !settings,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async getSettings(actor: Actor) {
    const rules = await this.rulesFor(actor);
    const settings = actor.organizationId ? await this.repo.findSettings(actor.organizationId) : null;
    const canEdit = can(actor, "sla.configure");
    return {
      targets: rules.targets,
      bugTargets: rules.bugTargets,
      featureRequestTarget: rules.featureRequestTarget,
      separateBugTargets: rules.separateBugTargets,
      separateFeatureRequestTarget: rules.separateFeatureRequestTarget,
      pausedStatuses: rules.pausedStatuses,
      escalation: escalationOf(settings),
      // The people an administrator can pick as escalation contacts.
      escalationCandidates: canEdit && actor.organizationId ? await this.repo.escalationCandidates(actor.organizationId) : [],
      isDefault: rules.isDefault,
      updatedAt: rules.updatedAt,
      canEdit,
    };
  }

  async updateSettings(actor: Actor, body: UpdateSlaSettingsBody) {
    if (!actor.organizationId) throw new AppError("No organisation on this account", 403);
    const existing = await this.repo.findSettings(actor.organizationId);

    // Omitted = leave escalation as it is (an older client saving only the targets).
    const escalation = body.escalation ?? escalationOf(existing);
    if (body.escalation && escalation.contactIds.length) {
      const known = await this.repo.countMembers(actor.organizationId, escalation.contactIds);
      if (known !== escalation.contactIds.length) {
        throw new AppError("Escalation contacts must be members of your organisation", 400);
      }
    }
    // Switching it on starts the clock: only issues created from now on escalate.
    const turningOn = escalation.enabled && !existing?.escalation?.enabled;

    const saved = await this.repo.saveSettings({
      organizationId: actor.organizationId,
      targets: body.targets,
      bugTargets: body.bugTargets ?? null,
      featureRequestTarget: body.featureRequestTarget ?? null,
      pausedStatuses: [...new Set(body.pausedStatuses)],
      escalation,
      escalationSince: turningOn ? new Date() : (existing?.escalationSince ?? null),
      updatedById: actor.id,
    });
    const resolved = resolveTargets(saved);

    ActivityService.Instance.log(actor, {
      action: "sla.settings_updated",
      summary: "Updated the organisation's SLA rules",
      entityType: "sla_settings",
      entityId: actor.organizationId,
      metadata: {
        targets: body.targets,
        bugTargets: body.bugTargets ?? null,
        featureRequestTarget: body.featureRequestTarget ?? null,
        pausedStatuses: body.pausedStatuses,
        escalation,
      },
    });

    return {
      targets: resolved.targets,
      bugTargets: resolved.bugTargets,
      featureRequestTarget: resolved.featureRequestTarget,
      separateBugTargets: resolved.separateBugTargets,
      separateFeatureRequestTarget: resolved.separateFeatureRequestTarget,
      pausedStatuses: saved.pausedStatuses,
      escalation,
      escalationCandidates: await this.repo.escalationCandidates(actor.organizationId),
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

    const [kpis, overTime, bySeverity, byStatus, byType, bySource, byProject, byAssignee, bySupporter, recurring] =
      await Promise.all([
        this.repo.kpis(scope, filters, rules),
        this.repo.overTime(scope, filters, rules, interval),
        this.repo.bySeverity(scope, filters, rules),
        this.repo.byStage(scope, filters, rules),
        this.repo.byType(scope, filters, rules),
        this.repo.bySource(scope, filters, rules),
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
      bySource: bySource.map(numeric),
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
    // The product-org triage list is for the product team; an external
    // supporter has their own queue and cannot deep-link into it.
    const canOpen = !isExternalSupporter(actor);
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

  async filterOptions(actor: Actor, projectId?: string) {
    const scope = this.scopeFor(actor);
    const rules = await this.rulesFor(actor);
    return this.repo.filterOptions(scope, rules, projectId);
  }
}

interface ResolvedTargets {
  targets: SlaTargets;
  bugTargets: SlaTargets;
  featureRequestTarget: SlaTarget;
  // Whether bugs / feature requests have their own targets, or are still
  // following the tickets' (the state before per-source rules existed).
  separateBugTargets: boolean;
  separateFeatureRequestTarget: boolean;
}

// The targets each source is actually judged against. Unconfigured sources
// follow the ticket targets, so saving nothing new changes no numbers.
function resolveTargets(
  settings: Pick<SlaSettings, "targets" | "bugTargets" | "featureRequestTarget"> | null
): ResolvedTargets {
  // Merge so a partially-configured row still has every severity key — the SQL
  // indexes targets by severity and must never hit a null.
  const targets = { ...DEFAULT_SLA_TARGETS, ...(settings?.targets ?? {}) };
  return {
    targets,
    bugTargets: { ...targets, ...(settings?.bugTargets ?? {}) },
    featureRequestTarget: settings?.featureRequestTarget ?? targets.default,
    separateBugTargets: Boolean(settings?.bugTargets),
    separateFeatureRequestTarget: Boolean(settings?.featureRequestTarget),
  };
}

function escalationOf(settings: Pick<SlaSettings, "escalation"> | null): SlaEscalationRules {
  return { ...DEFAULT_SLA_ESCALATION, ...(settings?.escalation ?? {}) };
}

// The rules the SLA maths runs on for an organisation's saved settings (or the
// defaults) — what the escalation sweeper judges breaches against.
export function rulesFromSettings(settings: SlaSettings | null): SlaRules {
  const resolved = resolveTargets(settings);
  return {
    targets: resolved.targets,
    bugTargets: resolved.bugTargets,
    featureRequestTarget: resolved.featureRequestTarget,
    pausedStatuses: settings?.pausedStatuses ?? [],
  };
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

// Daily buckets for short ranges, weekly for a few months, monthly for up to
// a couple of years, yearly beyond that.
export function pickInterval(from?: string, to?: string): "day" | "week" | "month" | "year" {
  if (!from) return "month";
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  const days = (end - start) / 86_400_000;
  if (days <= 45) return "day";
  if (days <= 200) return "week";
  if (days <= 730) return "month";
  return "year";
}

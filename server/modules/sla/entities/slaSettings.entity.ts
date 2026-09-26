// modules/sla/entities/slaSettings.entity.ts
// An organisation's SLA rules — one row per org, absent means code defaults
// (see DEFAULT_SLA_TARGETS in sla.service.ts). Targets are keyed by ticket
// severity ("default" covers tickets with no severity — anything not yet
// escalated by IT support).
import { EntitySchema } from "typeorm";

export interface SlaTarget {
  firstResponseHours: number;
  resolutionHours: number;
}

export type SlaTargets = Record<string, SlaTarget>; // default | low | medium | high | critical

export interface SlaSettings {
  organizationId: string;
  // Ticket targets — also what bugs and feature requests fall back to.
  targets: SlaTargets;
  // Separate targets for bugs, keyed by their priority mapped to
  // low/medium/high/critical (Urgent → critical). Null = follow `targets`.
  bugTargets: SlaTargets | null;
  // Feature requests carry no severity, so they get a single target.
  // Null = follow the tickets' "default" target.
  featureRequestTarget: SlaTarget | null;
  // Stage names (FeedbackStatus / SupportStatus) during which the SLA clock
  // is paused — e.g. "resolved" while awaiting closure. Empty = never pause.
  pausedStatuses: string[];
  updatedById: string | null;
  updatedAt: Date;
}

const SlaSettings = new EntitySchema<SlaSettings>({
  name: "SlaSettings",
  tableName: "sla_settings",
  columns: {
    organizationId: {
      name: "organization_id",
      type: "uuid",
      primary: true,
    },
    targets: {
      type: "jsonb",
    },
    bugTargets: {
      name: "bug_targets",
      type: "jsonb",
      nullable: true,
    },
    featureRequestTarget: {
      name: "feature_request_target",
      type: "jsonb",
      nullable: true,
    },
    pausedStatuses: {
      name: "paused_statuses",
      type: "text",
      array: true,
      default: () => "'{}'",
    },
    updatedById: {
      name: "updated_by_id",
      type: "uuid",
      nullable: true,
    },
    updatedAt: {
      name: "updated_at",
      type: "timestamptz",
      updateDate: true,
    },
  },
});

export { SlaSettings };

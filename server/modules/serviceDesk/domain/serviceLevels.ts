// modules/serviceDesk/domain/serviceLevels.ts
// How long approval and fulfilment may take, and when lateness escalates.
// Pure — the sweeper, the request service and the reports all share it.
//
//   approval    each approval step gets `approvalHours` (an item may override)
//               from the moment it starts
//   fulfilment  from the moment a request reaches IT (submitted, or approved)
//               to fulfilled: `fulfilmentHours[priority]` (an item may override)
//
// Escalation, per phase, measured against the target T:
//   level 1  at the due time         remind whoever is holding it up
//   level 2  at due + level2Pct% of T  tell the escalation contacts
//   level 3  at due + level3Pct% of T  tell them again, as critical
// Time spent waiting for information from the requester is added back to the
// due time when they answer, so it never counts against anyone.
import { z } from "zod";
import { REQUEST_PRIORITIES, type RequestPriority } from "./lifecycle";

export interface EscalationRules {
  level2Pct: number;
  level3Pct: number;
  // Who hears about level 2 and 3. Empty = servicedesk.manage holders.
  contactIds: string[];
}

export interface ServiceLevels {
  approvalHours: number;
  fulfilmentHours: Record<RequestPriority, number>;
  escalation: EscalationRules;
}

export const DEFAULT_SERVICE_LEVELS: ServiceLevels = Object.freeze({
  approvalHours: 48,
  fulfilmentHours: { critical: 8, high: 24, medium: 72, low: 120 },
  escalation: { level2Pct: 50, level3Pct: 100, contactIds: [] },
}) as ServiceLevels;

const hours = z.number().int().min(1).max(24 * 90);

export const serviceLevelsSchema = z
  .object({
    approvalHours: hours,
    fulfilmentHours: z.object(
      Object.fromEntries(REQUEST_PRIORITIES.map((p) => [p, hours])) as Record<RequestPriority, typeof hours>
    ),
    escalation: z.object({
      level2Pct: z.number().int().min(1).max(1000),
      level3Pct: z.number().int().min(1).max(1000),
      contactIds: z.array(z.string().uuid()).max(20).transform((ids) => [...new Set(ids)]),
    }),
  })
  .refine((v) => v.escalation.level3Pct > v.escalation.level2Pct, {
    message: "The third escalation must come after the second",
    path: ["escalation", "level3Pct"],
  });

export function approvalTargetHours(levels: ServiceLevels, itemHours: number | null | undefined): number {
  return itemHours ?? levels.approvalHours;
}

export function fulfilmentTargetHours(
  levels: ServiceLevels,
  priority: RequestPriority,
  itemHours: number | null | undefined
): number {
  return itemHours ?? levels.fulfilmentHours[priority] ?? DEFAULT_SERVICE_LEVELS.fulfilmentHours[priority];
}

export function addHours(from: Date, h: number): Date {
  return new Date(from.getTime() + h * 3_600_000);
}

// The escalation level a phase should be at right now (0 = not late).
export function escalationLevelAt(now: Date, dueAt: Date, targetHours: number, rules: EscalationRules): 0 | 1 | 2 | 3 {
  const late = now.getTime() - dueAt.getTime();
  if (late < 0) return 0;
  const target = targetHours * 3_600_000;
  if (late >= (target * rules.level3Pct) / 100) return 3;
  if (late >= (target * rules.level2Pct) / 100) return 2;
  return 1;
}

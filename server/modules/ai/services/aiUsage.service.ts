// modules/ai/services/aiUsage.service.ts
// The AI usage report for the organisation's AI admins (ai.managekeys):
// requests and failures, response times, which features are used, why
// requests fail, and how many people use AI. Built from ai_usage_logs, which
// holds counts only — no prompt or reply text exists to show.
import { AiUsageRepository } from "../repositories/aiUsage.repository";
import type { Actor } from "../../../shared/types/actor";

const { AppError } = require("../../../shared/errors/AppError");
const { assertPermission } = require("../../../shared/access/can");

export const USAGE_PERIODS = [7, 30, 90] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export class AiUsageService {
  static Instance = new AiUsageService();

  constructor(
    private readonly repo: AiUsageRepository = AiUsageRepository.Instance,
    private readonly now: () => Date = () => new Date()
  ) {}

  async report(actor: Actor, days: UsagePeriod) {
    assertPermission(actor, "ai.managekeys");
    if (!actor.organizationId) throw new AppError("No organisation on this account", 403);
    const since = new Date(this.now().getTime() - days * 24 * 60 * 60 * 1000);

    const [totals, byFeature, byDay, errors] = await Promise.all([
      this.repo.totals(actor.organizationId, since),
      this.repo.byFeature(actor.organizationId, since),
      this.repo.byDay(actor.organizationId, since),
      this.repo.errors(actor.organizationId, since),
    ]);

    return {
      days,
      since: since.toISOString(),
      totals: {
        ...totals,
        failureRate: totals.requests ? Math.round((totals.failed / totals.requests) * 1000) / 10 : 0,
        adoptionRate: totals.teamSize ? Math.round((totals.people / totals.teamSize) * 1000) / 10 : 0,
      },
      byFeature,
      byDay,
      errors,
    };
  }
}

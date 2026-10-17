// modules/serviceDesk/services/serviceDeskReports.service.ts
// IT-request reporting (servicedesk.report): where things stand right now,
// and how the chosen period went — throughput, approval and fulfilment times,
// service-level attainment, escalations, and the breakdowns behind them.
import { ServiceDeskReportsRepository } from "../repositories/serviceDeskReports.repository";
import { ServiceDeskService, type DeskActor } from "./serviceDesk.service";
import { formatReference } from "../domain/lifecycle";
import type { ReportQuery } from "../validators/serviceDesk.schema";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;

export class ServiceDeskReportsService {
  static Instance = new ServiceDeskReportsService();

  constructor(
    private readonly repo = ServiceDeskReportsRepository.Instance,
    private readonly desk = ServiceDeskService.Instance
  ) {}

  async overview(actor: DeskActor, q: ReportQuery) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const { from, to } = rangeOf(q);
    const range = { organizationId, from, to };

    const [now, throughput, escalations, byCategory, byAssignee, overdue, levels] = await Promise.all([
      this.repo.snapshot(organizationId),
      this.repo.throughput(range),
      this.repo.escalations(range),
      this.repo.byCategory(range),
      this.repo.byAssignee(range),
      this.repo.overdueList(organizationId),
      this.desk.serviceLevels(organizationId),
    ]);

    return {
      range: { from: isoDay(from), to: isoDay(new Date(to.getTime() - 86_400_000)) },
      now,
      throughput: {
        ...throughput,
        // Fulfilled within its service level, of those that had one.
        onTimeRate: throughput.fulfilledWithTarget ? throughput.fulfilledOnTime / throughput.fulfilledWithTarget : null,
      },
      escalations: {
        approval: sumLevels(escalations, "approval"),
        fulfilment: sumLevels(escalations, "fulfilment"),
      },
      byCategory,
      byAssignee,
      overdue: overdue.map((o: { requestNumber: number } & Record<string, unknown>) => ({
        ...o,
        reference: formatReference(o.requestNumber),
      })),
      serviceLevels: levels,
    };
  }
}

// Whole days: from 00:00 on `from` to the end of `to`. Defaults to the last 30 days.
function rangeOf(q: ReportQuery): { from: Date; to: Date } {
  const today = new Date(`${isoDay(new Date())}T00:00:00Z`);
  const to = q.to ? new Date(`${q.to}T00:00:00Z`) : today;
  let from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(to.getTime() - (DEFAULT_DAYS - 1) * 86_400_000);
  if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_DAYS) from = new Date(to.getTime() - MAX_DAYS * 86_400_000);
  return { from, to: new Date(to.getTime() + 86_400_000) };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumLevels(rows: { phase: string; level: number; n: number }[], phase: string) {
  const out = { level1: 0, level2: 0, level3: 0 };
  for (const r of rows) {
    if (r.phase !== phase) continue;
    if (r.level === 1) out.level1 += r.n;
    if (r.level === 2) out.level2 += r.n;
    if (r.level === 3) out.level3 += r.n;
  }
  return out;
}

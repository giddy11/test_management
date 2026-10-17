// modules/serviceDesk/services/serviceDeskEscalation.service.ts
// The sweeper: finds requests past their service level and escalates them
// (story 3, AC 7–8). See domain/serviceLevels.ts for the levels.
//
//   level 1  remind whoever is holding it up — the live step's approvers
//            (and their delegates), or the assignee (everyone in IT when
//            nobody has picked it up)
//   level 2  the same people, plus the escalation contacts (or, when none
//            are configured, the servicedesk.manage holders)
//   level 3  the same again, marked critical
//
// TestMate has no job runner, so this runs in-process: on a timer, and on
// demand when someone loads their IT-request counts (a server that sleeps
// between requests still escalates as soon as anyone looks). A Postgres
// advisory lock means only one server sweeps at a time, and the unique
// (request, phase, step, level) escalation row means a level is never sent
// twice — so running it too often is harmless.
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { ServiceRequestRepository, type OverdueRow, type RequestRow } from "../repositories/serviceRequest.repository";
import { ServiceDeskRepository, type PersonRow } from "../repositories/serviceDesk.repository";
import { ServiceDeskService, PERMS } from "./serviceDesk.service";
import { ServiceDeskNotifier } from "./serviceDeskNotifier";
import { escalationLevelAt, type ServiceLevels } from "../domain/serviceLevels";
import { formatReference } from "../domain/lifecycle";

const { ActivityService } = require("../../activity/services/activity.service");

// Any fixed 32-bit number, unique to this job across the app.
const LOCK_KEY = 74_210_031;
const BATCH = 200;
const MIN_GAP_MS = 60_000;

export class ServiceDeskEscalationService {
  static Instance = new ServiceDeskEscalationService();

  private running = false;
  private lastRun = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repo = ServiceRequestRepository.Instance,
    private readonly deskRepo = ServiceDeskRepository.Instance,
    private readonly desk = ServiceDeskService.Instance,
    private readonly notifier = ServiceDeskNotifier.Instance,
    private readonly activity = ActivityService.Instance
  ) {}

  // Called once at boot (server.js).
  start(intervalMs = 5 * 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), intervalMs);
    this.timer.unref?.();
    setTimeout(() => void this.sweep(), 30_000).unref?.();
  }

  // Opportunistic run, at most once a minute per server.
  kick(): void {
    if (Date.now() - this.lastRun > MIN_GAP_MS) void this.sweep();
  }

  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    this.lastRun = Date.now();
    const runner = AppDataSource.createQueryRunner();
    let sent = 0;
    try {
      await runner.connect();
      const [{ locked }] = await runner.query(`SELECT pg_try_advisory_lock($1) AS "locked"`, [LOCK_KEY]);
      if (!locked) return 0;
      try {
        const levelsByOrg = new Map<string, ServiceLevels>();
        for (const row of await this.repo.overdue(BATCH)) {
          try {
            if (!levelsByOrg.has(row.organizationId)) {
              levelsByOrg.set(row.organizationId, await this.desk.serviceLevels(row.organizationId));
            }
            if (await this.escalate(row, levelsByOrg.get(row.organizationId)!, now)) sent += 1;
          } catch (e) {
            console.error(`[serviceDesk] escalation of ${row.id} failed:`, (e as Error).message);
          }
        }
      } finally {
        await runner.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY]);
      }
    } catch (e) {
      console.error("[serviceDesk] escalation sweep failed:", (e as Error).message);
    } finally {
      await runner.release().catch(() => {});
      this.running = false;
    }
    return sent;
  }

  private async escalate(row: OverdueRow, levels: ServiceLevels, now: Date): Promise<boolean> {
    const level = escalationLevelAt(now, new Date(row.dueAt), Number(row.targetHours), levels.escalation);
    if (level <= row.level) return false;
    const r = await this.repo.findRow(row.organizationId, row.id);
    if (!r) return false;

    const holders = await this.holdersOf(r, row.phase);
    const contacts = level >= 2 ? await this.contacts(row.organizationId, levels) : [];
    const recipients = dedupe([...holders, ...contacts]);
    const ref = formatReference(r.requestNumber);
    const phaseLabel = row.phase === "approval" ? "approval" : "fulfilment";

    const recorded = await this.repo.run((m) =>
      this.repo.recordEscalation(
        m,
        row,
        level,
        recipients.map((p) => p.id),
        this.activity.buildEntry(
          { id: null, organizationId: row.organizationId, role: null, name: "Automatic escalation" },
          {
            action: "service_request.escalated",
            summary: `Escalated IT request ${ref}: ${phaseLabel} overdue (level ${level})`,
            entityType: "service_request",
            entityId: r.id,
            severity: level >= 3 ? "warning" : "info",
            metadata: { phase: row.phase, step: row.stepOrder, level, dueAt: row.dueAt, notified: recipients.map((p) => p.id) },
          }
        )
      )
    );
    if (!recorded) return false;

    const late = describeLate(now, new Date(row.dueAt));
    this.notifier.send(recipients, {
      kind: "escalated",
      requestId: r.id,
      organizationId: r.organizationId,
      title: `${level >= 3 ? "Critical — " : ""}Overdue ${phaseLabel}: ${ref} ${r.title}`,
      heading: row.phase === "approval" ? "An IT request is waiting too long for approval" : "An IT request is overdue",
      body:
        row.phase === "approval"
          ? `"${r.title}" from ${r.requesterName} has been waiting for approval ${late} past its target.`
          : `"${r.title}" from ${r.requesterName} is ${late} past its fulfilment target${r.assigneeName ? ` (with ${r.assigneeName})` : " and nobody has picked it up"}.`,
      note: level >= 2 ? `Escalation level ${level} of 3.` : null,
      noteLabel: "Escalation",
      ctaLabel: "Open the request",
    });
    return true;
  }

  // Who is holding the request up.
  private async holdersOf(r: RequestRow, phase: "approval" | "fulfilment"): Promise<PersonRow[]> {
    if (phase === "approval") {
      return this.deskRepo.peopleByIds(r.organizationId, await this.repo.pendingApproverIds(r.id));
    }
    if (r.assigneeId) return this.deskRepo.peopleByIds(r.organizationId, [r.assigneeId]);
    return this.deskRepo.usersWithPermission(r.organizationId, [PERMS.WORK]);
  }

  private async contacts(organizationId: string, levels: ServiceLevels): Promise<PersonRow[]> {
    if (levels.escalation.contactIds.length) return this.deskRepo.peopleByIds(organizationId, levels.escalation.contactIds);
    return this.deskRepo.usersWithPermission(organizationId, [PERMS.MANAGE]);
  }
}

function dedupe(people: PersonRow[]): PersonRow[] {
  const seen = new Set<string>();
  return people.filter((p) => !seen.has(p.id) && !!seen.add(p.id));
}

function describeLate(now: Date, due: Date): string {
  const h = Math.max(0, Math.round((now.getTime() - due.getTime()) / 3_600_000));
  if (h < 1) return "less than an hour";
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} days`;
}

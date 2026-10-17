// modules/serviceDesk/services/serviceRequest.service.ts
// The life of an IT request: draft → submit → approval steps → IT → fulfilled,
// with cancel and "waiting for information" along the way. See
// domain/lifecycle.ts for the status table and domain/approvalPlan.ts for how
// approval steps are staffed and decided.
//
// Who may do what:
//   requester            create, edit a draft, submit, answer questions,
//                        cancel before IT starts, attach files
//   requested-for person read, comment, answer questions (it's about them)
//   approver             decide their step, or ask a question — because a
//                        policy or item named them (or they stand in for
//                        someone who was), never because of a role. Their
//                        group's authority must cover the request's risk.
//   servicedesk.work     the queue: assign, start, fulfil, ask a question,
//                        cancel with a reason, internal notes
// A requester never approves their own request, nor one raised for them.
import type { EntityManager } from "typeorm";
import { ServiceRequestRepository, type RequestRow } from "../repositories/serviceRequest.repository";
import { ServiceDeskRepository, type PersonRow } from "../repositories/serviceDesk.repository";
import { ApprovalSetupRepository } from "../repositories/approvalSetup.repository";
import { ServiceDeskService, PERMS, type DeskActor } from "./serviceDesk.service";
import { ServiceDeskNotifier, type DeskEvent } from "./serviceDeskNotifier";
import { ServiceDeskEscalationService } from "./serviceDeskEscalation.service";
import { ServiceDeskAutomationService, subjectOf } from "./serviceDeskAutomation.service";
import { AutomationRepository } from "../repositories/automation.repository";
import { autoApprovalRefusal, type RuleOutcome } from "../domain/automationRules";
import type { ItemSnapshot, ServiceRequest } from "../entities/serviceRequest.entity";
import type { ServiceCatalogItem } from "../entities/serviceCatalogItem.entity";
import type { ServiceRequestApproval } from "../entities/serviceRequestApproval.entity";
import { validateFormValues } from "../domain/formSchema";
import {
  NoApproverError,
  buildPlan,
  rowsMadeRedundant,
  stepState,
  stepsForApprovers,
  type PlannedStep,
  type PolicyStep,
} from "../domain/approvalPlan";
import {
  addHours,
  approvalTargetHours,
  fulfilmentTargetHours,
  type ServiceLevels,
} from "../domain/serviceLevels";
import {
  AGENT_CANCELLABLE,
  AGENT_CAN_ASK,
  READY_FOR_FULFILMENT,
  REQUESTER_CANCELLABLE,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  assertTransition,
  coversRisk,
  formatReference,
  isRequestStatus,
  parseReference,
  statusOnSubmit,
  type RequestPriority,
  type RequestStatus,
  type RiskLevel,
} from "../domain/lifecycle";
import { toAttachmentDto, toRequestDto } from "../dto/serviceDesk.dto";
import type { CreateRequestBody, ListApprovalsQuery, ListRequestsQuery, UpdateDraftBody } from "../validators/serviceDesk.schema";

const { AppError } = require("../../../shared/errors/AppError");
const { can } = require("../../../shared/access/can");
const { ActivityService } = require("../../activity/services/activity.service");
const { StorageService } = require("../../../shared/services/storage.service");
const { ALLOWED_IMAGE_TYPES } = require("../../../shared/middleware/upload.middleware");

type RequestedFor = Pick<ServiceRequest, "requestedForId" | "requestedForName" | "requestedForEmail">;

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

// Everything decided at submit (see prepareSubmission).
interface Submission {
  plan: PlannedStep[];
  levels: ServiceLevels;
  status: RequestStatus;
  priority: RequestPriority;
  assignToId: string | null;
  outcome: RuleOutcome;
  autoApproval: { requested: boolean; refusal: string | null; by: string | null } | null;
  historyNote: string | null;
}

const OPEN_VIEW: RequestStatus[] =["submitted", "pending_approval", "approved", "info_requested", "in_progress"];
export const MAX_ATTACHMENTS = 10;
const ATTACHMENT_FOLDER = "testmate/service-requests";

export class ServiceRequestService {
  static Instance = new ServiceRequestService();

  constructor(
    private readonly repo = ServiceRequestRepository.Instance,
    private readonly desk = ServiceDeskService.Instance,
    private readonly deskRepo = ServiceDeskRepository.Instance,
    private readonly notifier = ServiceDeskNotifier.Instance,
    private readonly activity = ActivityService.Instance,
    private readonly approvalRepo = ApprovalSetupRepository.Instance,
    private readonly storage = StorageService.Instance,
    private readonly automation = ServiceDeskAutomationService.Instance,
    private readonly automationRepo = AutomationRepository.Instance
  ) {}

  // ── Creating and submitting ────────────────────────────────────────────────
  async create(actor: DeskActor, body: CreateRequestBody) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const item = await this.activeItem(organizationId, body.catalogItemId);
    const snapshot = await this.snapshotOf(organizationId, item);
    const requestedFor = await this.requestedFor(organizationId, actor, body);
    const { values, errors } = validateFormValues(item.formSchema, body.formValues, { partial: !body.submit });
    if (errors.length) throw new AppError("Some answers need another look", 422, errors);

    const sub = body.submit
      ? await this.prepareSubmission(organizationId, item, snapshot, actor.id, {
          ...requestedFor,
          priority: body.priority,
          formValues: values,
          title: body.title,
          description: body.description,
        })
      : null;
    const status: RequestStatus = sub ? sub.status : "draft";
    const now = new Date();

    const saved = await this.repo.run(async (m) => {
      const row = await this.repo.insert(m, {
        organizationId,
        catalogItemId: item.id,
        itemSnapshot: snapshot,
        requesterId: actor.id,
        ...requestedFor,
        title: body.title,
        description: body.description,
        businessJustification: body.businessJustification,
        priority: sub?.priority ?? body.priority,
        riskLevel: item.riskLevel,
        formValues: values,
        status,
        submittedAt: sub ? now : null,
        statusUpdatedAt: now,
      });
      await this.repo.addHistory(m, { requestId: row.id, fromStatus: null, toStatus: status, actorId: actor.id, note: sub?.historyNote ?? null });
      if (sub) await this.recordSubmission(m, actor, row, sub, now);
      return row;
    });

    const fresh = await this.mustFindRow(organizationId, saved.id);
    if (body.submit) await this.announceSubmission(actor, fresh);
    return toRequestDto(fresh);
  }

  async updateDraft(actor: DeskActor, id: string, body: UpdateDraftBody) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const current = await this.mustFindRow(organizationId, id);
    if (current.requesterId !== actor.id) throw new AppError("Only the person who raised it can edit this request", 403);
    if (current.status !== "draft") throw new AppError("Only a draft can be edited", 409);

    const itemId = body.catalogItemId ?? current.catalogItemId;
    if (!itemId) throw new AppError("This request's catalog item no longer exists — start a new request", 409);
    const item = await this.activeItem(organizationId, itemId);
    const merged = {
      requestedForId: body.requestedForId !== undefined ? body.requestedForId : current.requestedForId,
      requestedForName: body.requestedForName !== undefined ? body.requestedForName : current.requestedForName,
      requestedForEmail: body.requestedForEmail !== undefined ? body.requestedForEmail : current.requestedForEmail,
    };
    const requestedFor = await this.requestedFor(organizationId, actor, merged);
    const { values, errors } = validateFormValues(item.formSchema, body.formValues ?? current.formValues, { partial: true });
    if (errors.length) throw new AppError("Some answers need another look", 422, errors);
    const snapshot = await this.snapshotOf(organizationId, item);

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked || locked.status !== "draft") throw new AppError("Only a draft can be edited", 409);
      await this.repo.update(m, id, {
        catalogItemId: item.id,
        itemSnapshot: snapshot,
        riskLevel: item.riskLevel,
        ...requestedFor,
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.businessJustification !== undefined && { businessJustification: body.businessJustification }),
        ...(body.priority !== undefined && { priority: body.priority }),
        formValues: values,
      });
    });
    return toRequestDto(await this.mustFindRow(organizationId, id));
  }

  async submit(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const current = await this.mustFindRow(organizationId, id);
    if (current.requesterId !== actor.id) throw new AppError("Only the person who raised it can submit this request", 403);
    if (current.status !== "draft") throw new AppError("This request has already been submitted", 409);
    if (!current.catalogItemId) throw new AppError("This request's catalog item no longer exists — start a new request", 409);

    // Judged by the item as it stands NOW — a draft may have sat for weeks
    // while the form, its approvers or its risk changed.
    const item = await this.activeItem(organizationId, current.catalogItemId);
    const { values, errors } = validateFormValues(item.formSchema, current.formValues);
    if (errors.length) throw new AppError("Some answers need another look", 422, errors);
    const snapshot = await this.snapshotOf(organizationId, item);
    const sub = await this.prepareSubmission(organizationId, item, snapshot, actor.id, {
      requestedForId: current.requestedForId,
      requestedForName: current.requestedForName,
      priority: current.priority,
      formValues: values,
      title: current.title,
      description: current.description,
    });
    const status = sub.status;

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked || locked.status !== "draft") throw new AppError("This request has already been submitted", 409);
      assertTransition("draft", status);
      const now = new Date();
      await this.repo.update(m, id, {
        status,
        itemSnapshot: snapshot,
        riskLevel: item.riskLevel,
        formValues: values,
        submittedAt: now,
        statusUpdatedAt: now,
      });
      await this.repo.addHistory(m, { requestId: id, fromStatus: "draft", toStatus: status, actorId: actor.id, note: sub.historyNote });
      await this.recordSubmission(m, actor, { ...locked, status, itemSnapshot: snapshot }, sub, now);
    });

    const fresh = await this.mustFindRow(organizationId, id);
    await this.announceSubmission(actor, fresh);
    return toRequestDto(fresh);
  }

  // Everything decided at submit, before anything is written: the automation
  // rules' outcome, the approval plan, and where the request goes first.
  private async prepareSubmission(
    organizationId: string,
    item: ServiceCatalogItem,
    snapshot: ItemSnapshot,
    actorId: string,
    input: {
      requestedForId: string | null;
      requestedForName: string | null;
      priority: RequestPriority;
      formValues: ServiceRequest["formValues"];
      title: string;
      description: string | null;
    }
  ): Promise<Submission> {
    const outcome = await this.automation.evaluate(
      organizationId,
      subjectOf({ itemSnapshot: snapshot, catalogItemId: item.id, riskLevel: item.riskLevel, ...input })
    );
    const priority = outcome.priority ?? input.priority;
    let assignToId: string | null = null;
    if (outcome.assignToId) {
      const agents = await this.deskRepo.usersWithPermission(organizationId, [PERMS.WORK]);
      if (agents.some((a) => a.id === outcome.assignToId)) assignToId = outcome.assignToId;
    }
    const plan = await this.planFor(organizationId, item, actorId, input.requestedForId);
    const levels = await this.desk.serviceLevels(organizationId);

    let status = statusOnSubmit(plan.length > 0);
    let autoApproval: Submission["autoApproval"] = null;
    if (outcome.autoApproveBy && plan.length > 0) {
      const refusal = autoApprovalRefusal(item, outcome.flags.length > 0);
      autoApproval = { requested: true, refusal, by: outcome.autoApproveBy };
      if (!refusal) status = "approved";
    }
    return {
      plan,
      levels,
      status,
      priority,
      assignToId,
      outcome,
      autoApproval,
      historyNote: status === "approved" ? `Approved automatically by the rule "${outcome.autoApproveBy}"` : null,
    };
  }

  private async recordSubmission(m: EntityManager, actor: DeskActor, row: ServiceRequest, sub: Submission, now: Date) {
    const auto = sub.status === "approved";
    if (!auto) await this.repo.insertPlan(m, row.id, sub.plan);
    const flagged = sub.outcome.flags.length > 0;
    await this.repo.update(m, row.id, {
      priority: sub.priority,
      ...(sub.assignToId && { assigneeId: sub.assignToId }),
      ...(flagged && {
        needsReview: true,
        reviewReason: sub.outcome.flags.map((f) => `${f.reason} (rule "${f.rule}")`).join("; ").slice(0, 500),
      }),
      ...(auto && { autoApproved: true, approvedAt: now }),
      ...(sub.plan.length && !auto
        ? this.approvalStepPatch(sub.levels, row.itemSnapshot, 1, now)
        : this.fulfilmentPatch(sub.levels, { priority: sub.priority, itemSnapshot: row.itemSnapshot }, now)),
    });
    for (const note of sub.outcome.notes) {
      await this.repo.addComment({ requestId: row.id, authorId: null, isInternal: true, body: `Automation — ${note.rule}: ${note.text}` }, m);
    }
    await this.automation.recordRuleRuns(m, row.organizationId, row.id, sub.outcome, sub.autoApproval, actor.id);
    await this.repo.addAudit(
      m,
      this.activity.buildEntry(actor, {
        action: "service_request.submitted",
        summary: `Submitted IT request ${formatReference(row.requestNumber)} "${row.title}"`,
        entityType: "service_request",
        entityId: row.id,
        metadata: {
          status: row.status,
          rules: sub.outcome.matched.map((r) => r.name),
          steps: auto ? [] : sub.plan.map((s) => ({ name: s.name, mode: s.mode, approverIds: s.approvers.map((a) => a.userId) })),
        },
      })
    );
    if (auto) {
      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.auto_approved",
          summary: `IT request ${formatReference(row.requestNumber)} was approved automatically by the rule "${sub.autoApproval?.by}"`,
          entityType: "service_request",
          entityId: row.id,
          severity: "warning",
        })
      );
    }
  }

  private async announceSubmission(actor: DeskActor, r: RequestRow) {
    if (r.status === "pending_approval") {
      await this.notifyApprovers(r, actor.id);
      return;
    }
    if (r.autoApproved) {
      this.notifier.send(await this.requesterSide(r), this.event(r, "update", {
        title: `Approved: ${formatReference(r.requestNumber)} ${r.title}`,
        heading: "Your IT request was approved automatically",
        body: `"${r.title}" met your organisation's rules for automatic approval. It's now with IT.`,
        ctaLabel: "View the request",
      }));
    }
    this.notifyQueue(r, actor.id);
    this.reachedIt(r.organizationId, r.id, actor.id);
  }

  // A connector may pick it up now (see ServiceDeskAutomationService).
  private reachedIt(organizationId: string, id: string, actorId: string | null) {
    this.automation
      .onReachedIt(organizationId, id, actorId)
      .catch((e: Error) => console.error(`[serviceDesk] automation start for ${id} failed:`, e.message));
  }

  // ── Service levels ─────────────────────────────────────────────────────────

  // An approval step starts: its own clock, escalation from zero.
  private approvalStepPatch(levels: ServiceLevels, snapshot: ItemSnapshot, step: number, now: Date): Partial<ServiceRequest> {
    const hours = approvalTargetHours(levels, snapshot.approvalHours);
    return {
      currentStep: step,
      approvalDueAt: addHours(now, hours),
      approvalTargetHours: hours,
      approvalEscalationLevel: 0,
    };
  }

  // The request reaches IT: the fulfilment clock starts.
  private fulfilmentPatch(levels: ServiceLevels, row: Pick<ServiceRequest, "priority" | "itemSnapshot">, now: Date): Partial<ServiceRequest> {
    const hours = fulfilmentTargetHours(levels, row.priority as RequestPriority, row.itemSnapshot.fulfilmentHours);
    return {
      currentStep: null,
      approvalDueAt: null,
      fulfilmentDueAt: addHours(now, hours),
      fulfilmentTargetHours: hours,
      fulfilmentEscalationLevel: 0,
    };
  }

  // ── Deciding ───────────────────────────────────────────────────────────────
  async approve(actor: DeskActor, id: string, comment: string | null) {
    return this.decide(actor, id, "approved", comment);
  }

  async reject(actor: DeskActor, id: string, comment: string) {
    return this.decide(actor, id, "rejected", comment);
  }

  private async decide(actor: DeskActor, id: string, decision: "approved" | "rejected", comment: string | null) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const [levels, delegations] = await Promise.all([
      this.desk.serviceLevels(organizationId),
      this.approvalRepo.activeDelegations(organizationId),
    ]);
    // Assigned inside the transaction; the cast stops TS narrowing it to the initial value.
    let outcome = "step_pending" as "rejected" | "approved" | "next_step" | "step_pending";
    let stepName = "";

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked) throw new AppError("Request not found", 404);
      const rows = await this.repo.approvalsOf(m, id);
      const step = locked.currentStep ?? 1;
      const stepRows = rows.filter((r) => r.stepOrder === step);
      const actsFor = (r: ServiceRequestApproval) => r.approverId === actor.id || delegations.get(r.approverId) === actor.id;
      const mine = stepRows.find((r) => r.decision === "pending" && actsFor(r));

      if (locked.status !== "pending_approval" || !mine) {
        if (!rows.some((r) => actsFor(r) || r.decidedById === actor.id)) {
          throw new AppError("You are not an approver for this request", 403);
        }
        if (locked.status !== "pending_approval") {
          throw new AppError(`This request is already ${STATUS_LABELS[locked.status].toLowerCase()}`, 409);
        }
        throw new AppError(
          rows.some((r) => actsFor(r) && r.decision === "waiting")
            ? "Your step hasn't started yet — an earlier approver decides first"
            : "You've already given your decision on this request",
          409
        );
      }
      // A delegate might be the requester; nobody approves their own request.
      if (actor.id === locked.requesterId || actor.id === locked.requestedForId) {
        throw new AppError("You can't approve a request raised by or for you", 403);
      }

      // Authority: a group member may only decide up to the group's level,
      // checked now — the group may have changed since the request was raised.
      let authorityLevel: RiskLevel | null = null;
      if (mine.groupId) {
        const group = await this.approvalRepo.findGroup(organizationId, mine.groupId);
        if (group && !coversRisk(group.maxRiskLevel, locked.riskLevel)) {
          throw new AppError(
            `This is a ${locked.riskLevel}-risk request, beyond the authority of ${group.name} (up to ${group.maxRiskLevel})`,
            403
          );
        }
        authorityLevel = group?.maxRiskLevel ?? null;
      }

      const now = new Date();
      stepName = mine.stepName ?? `Step ${step}`;
      await this.repo.decide(m, mine.id, { decision, comment, decidedById: actor.id, authorityLevel });
      const ref = formatReference(locked.requestNumber);
      const onBehalf = mine.approverId !== actor.id ? { onBehalfOf: mine.approverId } : {};

      if (decision === "rejected") {
        assertTransition(locked.status, "rejected");
        await this.repo.skipUndecided(m, id);
        await this.repo.update(m, id, { status: "rejected", statusUpdatedAt: now, currentStep: null, approvalDueAt: null });
        await this.repo.addHistory(m, { requestId: id, fromStatus: locked.status, toStatus: "rejected", actorId: actor.id, note: comment });
        outcome = "rejected";
      } else {
        const updated = stepRows.map((r) => (r.id === mine.id ? { ...r, decision: "approved" as const } : r));
        await this.repo.skipRows(m, rowsMadeRedundant(mine.stepMode, updated, { ...mine, decision: "approved" }).map((r) => r.id));
        if (stepState(mine.stepMode, updated) === "approved") {
          const nextRows = rows.filter((r) => r.stepOrder === step + 1);
          if (nextRows.length) {
            await this.repo.activateStep(m, id, step + 1);
            await this.repo.update(m, id, this.approvalStepPatch(levels, locked.itemSnapshot, step + 1, now));
            await this.repo.addHistory(m, {
              requestId: id,
              fromStatus: locked.status,
              toStatus: "pending_approval",
              actorId: actor.id,
              note: `${stepName} approved${comment ? `: ${comment}` : ""}. Now with ${nextRows[0].stepName ?? `step ${step + 1}`}.`,
            });
            outcome = "next_step";
          } else {
            assertTransition(locked.status, "approved");
            await this.repo.update(m, id, {
              status: "approved",
              approvedAt: now,
              statusUpdatedAt: now,
              ...this.fulfilmentPatch(levels, locked, now),
            });
            await this.repo.addHistory(m, { requestId: id, fromStatus: locked.status, toStatus: "approved", actorId: actor.id, note: comment });
            outcome = "approved";
          }
        }
      }

      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: `service_request.${decision}`,
          summary: `${decision === "approved" ? "Approved" : "Rejected"} ${stepName} of IT request ${ref} "${locked.title}"`,
          entityType: "service_request",
          entityId: id,
          metadata: { step, stepName, comment, authorityLevel, riskLevel: locked.riskLevel, ...onBehalf },
        })
      );
    });

    const r = await this.mustFindRow(organizationId, id);
    const ref = formatReference(r.requestNumber);
    const decider = nameOf(actor);
    if (outcome === "rejected") {
      this.notifier.send(await this.requesterSide(r), this.event(r, "update", {
        title: `Rejected: ${ref} ${r.title}`,
        heading: "Your IT request was rejected",
        body: `${decider} rejected your request "${r.title}" at ${stepName}.`,
        note: comment,
        noteLabel: "Reason",
        ctaLabel: "View the request",
      }), actor.id);
    } else if (outcome === "next_step") {
      await this.notifyApprovers(r, actor.id);
    } else if (outcome === "approved") {
      this.notifier.send(await this.requesterSide(r), this.event(r, "update", {
        title: `Approved: ${ref} ${r.title}`,
        heading: "Your IT request was approved",
        body: `${decider} gave the final approval for "${r.title}". It's now with IT.`,
        note: comment,
        noteLabel: "Comment",
        ctaLabel: "View the request",
      }), actor.id);
      this.notifyQueue(r, actor.id);
      this.reachedIt(organizationId, id, actor.id);
    }
    return toRequestDto(r);
  }

  // ── Waiting for information ────────────────────────────────────────────────

  // An approver (on their live step) or IT asks the requester something. The
  // request pauses, and its service-level clock with it.
  async askForInfo(actor: DeskActor, id: string, question: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const delegations = await this.approvalRepo.activeDelegations(organizationId);

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked || locked.status === "draft") throw new AppError("Request not found", 404);
      let allowed = false;
      if (locked.status === "pending_approval") {
        const step = locked.currentStep ?? 1;
        allowed = (await this.repo.approvalsOf(m, id)).some(
          (r) =>
            r.stepOrder === step &&
            r.decision === "pending" &&
            (r.approverId === actor.id || delegations.get(r.approverId) === actor.id)
        );
      } else if (AGENT_CAN_ASK.includes(locked.status)) {
        allowed = can(actor, PERMS.WORK);
      }
      if (!allowed) {
        throw new AppError(
          locked.status === "info_requested"
            ? "A question is already waiting for an answer"
            : `You can't ask for information on a request that is ${STATUS_LABELS[locked.status].toLowerCase()}`,
          409
        );
      }
      assertTransition(locked.status, "info_requested");
      const now = new Date();
      await this.repo.update(m, id, {
        status: "info_requested",
        statusUpdatedAt: now,
        infoRequestedAt: now,
        infoRequestedFrom: locked.status,
        infoRequestedById: actor.id,
      });
      await this.repo.addComment({ requestId: id, authorId: actor.id, body: question, isInternal: false }, m);
      await this.repo.addHistory(m, { requestId: id, fromStatus: locked.status, toStatus: "info_requested", actorId: actor.id, note: question });
      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.info_requested",
          summary: `Asked for more information on IT request ${formatReference(locked.requestNumber)}`,
          entityType: "service_request",
          entityId: id,
        })
      );
    });

    const r = await this.mustFindRow(organizationId, id);
    this.notifier.send(await this.requesterSide(r), this.event(r, "update", {
      title: `Question about ${formatReference(r.requestNumber)} ${r.title}`,
      heading: "IT needs more information",
      body: `${nameOf(actor)} has a question about "${r.title}". It's on hold until you answer.`,
      note: question,
      noteLabel: "Question",
      ctaLabel: "Answer",
    }), actor.id);
    return toRequestDto(r);
  }

  // The requester (or the person it's for) answers; the request goes back to
  // exactly where it was, with the paused time added back to its due dates.
  async provideInfo(actor: DeskActor, id: string, answer: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    let askerId: string | null = null;

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked) throw new AppError("Request not found", 404);
      if (locked.requesterId !== actor.id && locked.requestedForId !== actor.id) {
        throw new AppError("Only the requester can answer", 403);
      }
      if (locked.status !== "info_requested") throw new AppError("Nothing is waiting for an answer", 409);
      const back = locked.infoRequestedFrom;
      if (!back || !isRequestStatus(back)) throw new AppError("This request can't be resumed — ask IT to look at it", 409);
      assertTransition("info_requested", back);
      const now = new Date();
      const paused = now.getTime() - new Date(locked.infoRequestedAt ?? now).getTime();
      const shift = (d: Date | null) => (d ? new Date(new Date(d).getTime() + paused) : null);
      askerId = locked.infoRequestedById;
      await this.repo.update(m, id, {
        status: back,
        statusUpdatedAt: now,
        infoRequestedAt: null,
        infoRequestedFrom: null,
        infoRequestedById: null,
        approvalDueAt: shift(locked.approvalDueAt),
        fulfilmentDueAt: shift(locked.fulfilmentDueAt),
      });
      await this.repo.addComment({ requestId: id, authorId: actor.id, body: answer, isInternal: false }, m);
      await this.repo.addHistory(m, { requestId: id, fromStatus: "info_requested", toStatus: back, actorId: actor.id, note: answer });
      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.info_provided",
          summary: `Answered the question on IT request ${formatReference(locked.requestNumber)}`,
          entityType: "service_request",
          entityId: id,
        })
      );
    });

    const r = await this.mustFindRow(organizationId, id);
    const ids = [askerId, r.assigneeId].filter(Boolean) as string[];
    this.notifier.send(await this.deskRepo.peopleByIds(organizationId, ids), this.event(r, "update", {
      title: `Answered: ${formatReference(r.requestNumber)} ${r.title}`,
      heading: "Your question was answered",
      body: `${nameOf(actor)} answered on "${r.title}". It's back to ${STATUS_LABELS[r.status].toLowerCase()}.`,
      note: answer,
      noteLabel: "Answer",
      ctaLabel: "Open the request",
    }), actor.id);
    return toRequestDto(r);
  }

  // ── Fulfilment (servicedesk.work) ──────────────────────────────────────────
  async assign(actor: DeskActor, id: string, assigneeId: string | null) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    let assignee: PersonRow | null = null;
    if (assigneeId) {
      assignee = (await this.deskRepo.usersWithPermission(organizationId, [PERMS.WORK])).find((p) => p.id === assigneeId) ?? null;
      if (!assignee) throw new AppError("Assign it to someone who works the IT queue", 422, [{ field: "assigneeId", message: "Pick someone from the list" }]);
    }

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked || locked.status === "draft") throw new AppError("Request not found", 404);
      if (TERMINAL_STATUSES.includes(locked.status)) {
        throw new AppError(`This request is ${STATUS_LABELS[locked.status].toLowerCase()} and can't be reassigned`, 409);
      }
      await this.repo.update(m, id, { assigneeId });
      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.assigned",
          summary: assignee
            ? `Assigned IT request ${formatReference(locked.requestNumber)} to ${assignee.name || assignee.email}`
            : `Unassigned IT request ${formatReference(locked.requestNumber)}`,
          entityType: "service_request",
          entityId: id,
          metadata: { from: locked.assigneeId, to: assigneeId },
        })
      );
    });

    const r = await this.mustFindRow(organizationId, id);
    if (assignee) {
      this.notifier.send([assignee], this.event(r, "update", {
        title: `Assigned to you: ${formatReference(r.requestNumber)} ${r.title}`,
        heading: "An IT request was assigned to you",
        body: `${nameOf(actor)} assigned you "${r.title}" from ${r.requesterName}.`,
        ctaLabel: "Open the request",
      }), actor.id);
    }
    return toRequestDto(r);
  }

  async start(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked || locked.status === "draft") throw new AppError("Request not found", 404);
      if (!READY_FOR_FULFILMENT.includes(locked.status)) {
        throw new AppError(
          locked.status === "pending_approval"
            ? "This request is still waiting for approval"
            : `This request is ${STATUS_LABELS[locked.status].toLowerCase()} and can't be started`,
          409
        );
      }
      // Belt and braces for BR 1.2: the status table already forbids it, but
      // never start work while any approval is outstanding or was refused.
      const approvals = await this.repo.approvalsOf(m, id);
      if (approvals.some((a) => a.decision === "pending" || a.decision === "waiting" || a.decision === "rejected")) {
        throw new AppError("This request has not been fully approved", 409);
      }
      assertIdentityChecked(locked);
      assertTransition(locked.status, "in_progress");
      const now = new Date();
      await this.repo.update(m, id, {
        status: "in_progress",
        startedAt: now,
        statusUpdatedAt: now,
        assigneeId: locked.assigneeId ?? actor.id,
        // A person is doing it: automation won't pick it up any more.
        ...(locked.itemSnapshot.fulfilmentType === "webhook" && { automationStatus: "manual" as const }),
      });
      await this.repo.addHistory(m, { requestId: id, fromStatus: locked.status, toStatus: "in_progress", actorId: actor.id });
      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.started",
          summary: `Started work on IT request ${formatReference(locked.requestNumber)}`,
          entityType: "service_request",
          entityId: id,
        })
      );
    });

    const r = await this.mustFindRow(organizationId, id);
    this.notifier.send(await this.requesterSide(r), this.event(r, "update", {
      title: `In progress: ${formatReference(r.requestNumber)} ${r.title}`,
      heading: "IT is working on your request",
      body: `${r.assigneeName ?? "IT"} has started on "${r.title}".`,
      ctaLabel: "View the request",
    }), actor.id);
    return toRequestDto(r);
  }

  async fulfil(actor: DeskActor, id: string, note: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked || locked.status === "draft") throw new AppError("Request not found", 404);
      if (locked.status !== "in_progress") throw new AppError("Start the request before marking it fulfilled", 409);
      if (locked.automationStatus === "running") {
        throw new AppError("Automation is working on this request — take it over first if you want to finish it yourself", 409);
      }
      assertIdentityChecked(locked);
      assertTransition(locked.status, "fulfilled");
      const now = new Date();
      await this.repo.update(m, id, {
        status: "fulfilled",
        fulfilledAt: now,
        statusUpdatedAt: now,
        resolutionNote: note,
        fulfilledBy: "person",
        needsReview: false,
        reviewReason: null,
      });
      await this.repo.addHistory(m, { requestId: id, fromStatus: "in_progress", toStatus: "fulfilled", actorId: actor.id, note });
      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.fulfilled",
          summary: `Fulfilled IT request ${formatReference(locked.requestNumber)} "${locked.title}"`,
          entityType: "service_request",
          entityId: id,
          metadata: {
            onTime: locked.fulfilmentDueAt ? now.getTime() <= new Date(locked.fulfilmentDueAt).getTime() : null,
          },
        })
      );
    });

    const r = await this.mustFindRow(organizationId, id);
    this.notifier.send(await this.requesterSide(r), this.event(r, "update", {
      title: `Done: ${formatReference(r.requestNumber)} ${r.title}`,
      heading: "Your IT request is fulfilled",
      body: `${nameOf(actor)} has completed "${r.title}".`,
      note,
      noteLabel: "What was done",
      ctaLabel: "View the request",
    }), actor.id);
    return toRequestDto(r);
  }

  // The requester may withdraw until IT starts; IT may cancel anything that
  // has reached it, but must say why.
  async cancel(actor: DeskActor, id: string, reason: string | null) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    let byRequester = false;

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked) throw new AppError("Request not found", 404);
      const isRequester = locked.requesterId === actor.id;
      const isAgent = can(actor, PERMS.WORK) && locked.status !== "draft";
      byRequester = isRequester && REQUESTER_CANCELLABLE.includes(locked.status);
      const agentMay = canAgentCancel(locked);
      const byAgent = !byRequester && isAgent && agentMay;
      if (!isRequester && !isAgent) throw new AppError("Request not found", 404);
      if (!byRequester && !byAgent) {
        throw new AppError(
          locked.status === "in_progress" && isRequester
            ? "IT has already started on this request — add a comment to ask them to stop"
            : `This request is ${STATUS_LABELS[locked.status].toLowerCase()} and can't be cancelled`,
          409
        );
      }
      if (byAgent && !reason) {
        throw new AppError("Say why it's being cancelled", 422, [{ field: "reason", message: "Say why it's being cancelled" }]);
      }
      assertTransition(locked.status, "cancelled");
      const now = new Date();
      await this.repo.skipUndecided(m, id);
      await this.repo.update(m, id, {
        status: "cancelled",
        cancelledAt: now,
        statusUpdatedAt: now,
        currentStep: null,
        infoRequestedAt: null,
        infoRequestedFrom: null,
        infoRequestedById: null,
        ...(byAgent && { resolutionNote: reason }),
      });
      await this.repo.addHistory(m, { requestId: id, fromStatus: locked.status, toStatus: "cancelled", actorId: actor.id, note: reason });
      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.cancelled",
          summary: `Cancelled IT request ${formatReference(locked.requestNumber)} "${locked.title}"`,
          entityType: "service_request",
          entityId: id,
          metadata: { by: byRequester ? "requester" : "it", reason },
        })
      );
    });

    const r = await this.mustFindRow(organizationId, id);
    const ref = formatReference(r.requestNumber);
    if (byRequester) {
      const assignee = r.assigneeId ? (await this.deskRepo.peopleByIds(organizationId, [r.assigneeId]))[0] : null;
      this.notifier.send([assignee], this.event(r, "update", {
        title: `Withdrawn: ${ref} ${r.title}`,
        heading: "An IT request was withdrawn",
        body: `${r.requesterName} cancelled "${r.title}". No further work is needed.`,
        note: reason,
        noteLabel: "Reason",
        ctaLabel: "View the request",
      }), actor.id);
    } else {
      this.notifier.send(await this.requesterSide(r), this.event(r, "update", {
        title: `Cancelled: ${ref} ${r.title}`,
        heading: "IT cancelled your request",
        body: `${nameOf(actor)} cancelled "${r.title}".`,
        note: reason,
        noteLabel: "Reason",
        ctaLabel: "View the request",
      }), actor.id);
    }
    return toRequestDto(r);
  }

  // ── Conversation ───────────────────────────────────────────────────────────
  async comment(actor: DeskActor, id: string, body: string, internal: boolean) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const r = await this.mustFindRow(organizationId, id);
    const viewer = await this.viewerOf(actor, r);
    if (!viewer.visible) throw new AppError("Request not found", 404);
    if (internal && !viewer.isAgent) throw new AppError("Only IT can add internal notes", 403);
    if (r.status === "draft") throw new AppError("Submit the request before starting a conversation", 409);

    const saved = await this.repo.addComment({ requestId: id, authorId: actor.id, body, isInternal: internal });

    const assignee = r.assigneeId ? (await this.deskRepo.peopleByIds(organizationId, [r.assigneeId]))[0] : null;
    const recipients = internal ? [assignee] : [...(await this.requesterSide(r)), assignee];
    this.notifier.send(recipients, this.event(r, "update", {
      title: `New ${internal ? "internal note" : "comment"}: ${formatReference(r.requestNumber)} ${r.title}`,
      heading: internal ? "New internal note on an IT request" : "New comment on an IT request",
      body: `${nameOf(actor)} wrote on "${r.title}".`,
      note: body,
      noteLabel: nameOf(actor),
      ctaLabel: "Reply",
    }), actor.id);

    return {
      id: saved.id,
      authorId: actor.id,
      authorName: nameOf(actor),
      body: saved.body,
      isInternal: saved.isInternal,
      createdAt: saved.createdAt,
    };
  }

  // ── Attachments ────────────────────────────────────────────────────────────

  // Anyone involved may add files until the request is finished. Images go up
  // as images; PDFs and Office files as raw files.
  async uploadAttachments(actor: DeskActor, id: string, files: UploadedFile[]) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const r = await this.mustFindRow(organizationId, id);
    const viewer = await this.viewerOf(actor, r);
    if (!viewer.visible) throw new AppError("Request not found", 404);
    if (TERMINAL_STATUSES.includes(r.status)) {
      throw new AppError(`This request is ${STATUS_LABELS[r.status].toLowerCase()} — no more files can be added`, 409);
    }
    if (!files?.length) throw new AppError("No files provided", 400);
    const existing = await this.repo.countAttachments(id);
    if (existing + files.length > MAX_ATTACHMENTS) {
      throw new AppError(`A request can have at most ${MAX_ATTACHMENTS} files`, 422);
    }

    const rows = [];
    for (const file of files) {
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
      const result = isImage
        ? await this.storage.uploadImage(file.buffer, { folder: ATTACHMENT_FOLDER })
        : await this.storage.uploadRaw(file.buffer, { folder: ATTACHMENT_FOLDER });
      rows.push({
        requestId: id,
        fileName: file.originalname.slice(0, 255),
        fileUrl: result.url,
        filePublicId: result.publicId,
        resourceType: (isImage ? "image" : "raw") as "image" | "raw",
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedById: actor.id,
      });
    }
    await this.repo.addAttachments(rows);
    if (r.status !== "draft") {
      this.activity.log(actor, {
        action: "service_request.files_added",
        summary: `Added ${rows.length} file${rows.length === 1 ? "" : "s"} to IT request ${formatReference(r.requestNumber)}`,
        entityType: "service_request",
        entityId: id,
      });
    }
    return (await this.repo.attachmentRows(id)).map(toAttachmentDto);
  }

  // Your own file while the request is open; IT may remove any file.
  async deleteAttachment(actor: DeskActor, id: string, attachmentId: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const r = await this.mustFindRow(organizationId, id);
    const viewer = await this.viewerOf(actor, r);
    if (!viewer.visible) throw new AppError("Request not found", 404);
    const file = await this.repo.findAttachment(id, attachmentId);
    if (!file) throw new AppError("File not found", 404);
    const own = file.uploadedById === actor.id && !TERMINAL_STATUSES.includes(r.status);
    if (!own && !viewer.isAgent) throw new AppError("You can only remove files you added", 403);

    // Remove from Cloudinary first, then drop the row.
    const remove = file.resourceType === "raw" ? this.storage.deleteRaw(file.filePublicId) : this.storage.deleteImage(file.filePublicId);
    await remove.catch(() => {});
    await this.repo.deleteAttachment(file.id);
    if (r.status !== "draft") {
      this.activity.log(actor, {
        action: "service_request.file_removed",
        summary: `Removed "${file.fileName}" from IT request ${formatReference(r.requestNumber)}`,
        entityType: "service_request",
        entityId: id,
      });
    }
  }

  // ── Reading ────────────────────────────────────────────────────────────────
  async list(actor: DeskActor, q: ListRequestsQuery) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    if (q.scope === "queue" && !can(actor, PERMS.WORK)) throw new AppError("You do not have permission to do this", 403);
    const statuses: readonly RequestStatus[] | undefined = q.status
      ? [q.status]
      : q.view === "ready"
        ? READY_FOR_FULFILMENT
        : q.view === "open"
          ? OPEN_VIEW
          : q.view === "closed"
            ? TERMINAL_STATUSES
            : undefined;
    const { data, meta } = await this.repo.list({
      organizationId,
      userId: actor.id,
      scope: q.scope,
      statuses,
      overdue: q.view === "overdue",
      needsReview: q.view === "review",
      assignee: q.scope === "queue" ? q.assignee : undefined,
      search: q.search,
      requestNumber: q.search ? parseReference(q.search) : null,
      page: q.page,
      limit: q.limit,
    });
    const internal = q.scope === "queue";
    return { data: data.map((r) => toRequestDto(r, { internal })), meta };
  }

  async approvals(actor: DeskActor, q: ListApprovalsQuery) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const { data, meta } = await this.repo.list({
      organizationId,
      userId: actor.id,
      scope: "approvals",
      approvalState: q.state,
      statuses: q.state === "pending" ? ["pending_approval"] : undefined,
      page: q.page,
      limit: q.limit,
    });
    return { data: data.map((r) => toRequestDto(r)), meta };
  }

  async counts(actor: DeskActor) {
    const organizationId = this.desk.orgOf(actor);
    if (!(await this.desk.isEnabled(organizationId))) return { pendingApprovals: 0, queue: null };
    // Everyone's sidebar polls this, which makes it a good heartbeat for the
    // escalation sweep on a server that sleeps between requests.
    ServiceDeskEscalationService.Instance.kick();
    return this.repo.counts(organizationId, actor.id, can(actor, PERMS.WORK));
  }

  async detail(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const r = await this.mustFindRow(organizationId, id);
    const viewer = await this.viewerOf(actor, r);
    if (!viewer.visible) throw new AppError("Request not found", 404);

    const [approvals, history, comments, attachments, item, delegations, runs, verifier] = await Promise.all([
      this.repo.approvalRows(id),
      this.repo.historyRows(id),
      this.repo.commentRows(id, viewer.isAgent),
      this.repo.attachmentRows(id),
      viewer.isAgent && r.catalogItemId ? this.deskRepo.findItem(organizationId, r.catalogItemId) : Promise.resolve(null),
      this.approvalRepo.activeDelegations(organizationId),
      viewer.isAgent ? this.automationRepo.runsForRequest(id) : Promise.resolve([]),
      viewer.isAgent && r.identityVerifiedById
        ? this.deskRepo.peopleByIds(organizationId, [r.identityVerifiedById]).then((p) => p[0] ?? null)
        : Promise.resolve(null),
    ]);
    const webhook = r.itemSnapshot.fulfilmentType === "webhook";
    const open = !TERMINAL_STATUSES.includes(r.status) && r.status !== "draft";
    const step = r.currentStep ?? 1;
    const myPending = approvals.find(
      (a) =>
        a.stepOrder === step &&
        a.decision === "pending" &&
        (a.approverId === actor.id || delegations.get(a.approverId) === actor.id)
    );
    const isRequesterSelf = r.requesterId === actor.id;
    const canDecide = !!myPending && r.status === "pending_approval" && actor.id !== r.requesterId && actor.id !== r.requestedForId;
    const isRequesterSide = r.requesterId === actor.id || r.requestedForId === actor.id;

    return {
      request: toRequestDto(r, { internal: viewer.isAgent }),
      approvals,
      history,
      comments,
      attachments: attachments.map(toAttachmentDto),
      // IT's own instructions for this kind of request — agents only.
      fulfilmentNotes: viewer.isAgent ? item?.fulfilmentNotes ?? null : null,
      // What automation did, and how identity was confirmed — IT only.
      automationRuns: runs.map((run) => ({
        id: run.id,
        kind: run.kind,
        status: run.status,
        ruleName: run.ruleName,
        endpointName: run.endpointName,
        attempt: run.attempt,
        nextAttemptAt: run.nextAttemptAt,
        reason: (run.detail?.reason as string | undefined) ?? null,
        note: (run.detail?.note as string | undefined) ?? null,
        error: run.error,
        initiatedByName: run.initiatedByName,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      })),
      identityCheck:
        viewer.isAgent && r.identityVerifiedAt
          ? { verifiedAt: r.identityVerifiedAt, verifiedByName: verifier?.name ?? null, method: r.identityMethod, note: r.identityNote }
          : null,
      // The AI's advisory triage — for the people deciding or doing it.
      aiTriage: viewer.isAgent || viewer.isApprover ? r.aiTriage : null,
      viewer: {
        isRequester: viewer.isRequester,
        isApprover: viewer.isApprover,
        isAgent: viewer.isAgent,
        canEdit: isRequesterSelf && r.status === "draft",
        canDecide,
        canAskInfo: canDecide || (viewer.isAgent && AGENT_CAN_ASK.includes(r.status)),
        canProvideInfo: isRequesterSide && r.status === "info_requested",
        canCancel:
          (isRequesterSelf && REQUESTER_CANCELLABLE.includes(r.status)) || (viewer.isAgent && canAgentCancel(r)),
        cancelNeedsReason: !(isRequesterSelf && REQUESTER_CANCELLABLE.includes(r.status)),
        canAssign: viewer.isAgent && r.status !== "draft" && !TERMINAL_STATUSES.includes(r.status),
        canStart: viewer.isAgent && READY_FOR_FULFILMENT.includes(r.status),
        canFulfil: viewer.isAgent && r.status === "in_progress",
        canComment: viewer.visible && r.status !== "draft",
        canAddInternalNote: viewer.isAgent && r.status !== "draft",
        canAttach: !TERMINAL_STATUSES.includes(r.status),
        myUserId: actor.id,
        // Phase 3
        needsIdentityCheck: !!r.itemSnapshot.requiresIdentityCheck && !r.identityVerifiedAt,
        canRecordIdentity: viewer.isAgent && !!r.itemSnapshot.requiresIdentityCheck && open,
        canClearReview: viewer.isAgent && r.needsReview && open,
        canRunAutomation:
          viewer.isAgent &&
          webhook &&
          ((READY_FOR_FULFILMENT.includes(r.status) && r.automationStatus !== "running") ||
            (r.status === "in_progress" && r.automationStatus === "failed")),
        canTakeOver: viewer.isAgent && webhook && open && (r.automationStatus === "running" || r.automationStatus === "failed"),
        canAiTriage: (viewer.isAgent || viewer.isApprover) && r.status !== "draft",
      },
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Who may see a request. A draft is the requester's alone.
  private async viewerOf(actor: DeskActor, r: RequestRow) {
    const isRequester = r.requesterId === actor.id || (r.requestedForId === actor.id && r.status !== "draft");
    const isAgent = can(actor, PERMS.WORK) && r.status !== "draft";
    const isApprover = r.status !== "draft" && (await this.repo.isApprover(r.id, actor.id));
    const visible = r.status === "draft" ? r.requesterId === actor.id : isRequester || isAgent || isApprover;
    return { visible, isRequester, isAgent, isApprover };
  }

  private async mustFindRow(organizationId: string, id: string): Promise<RequestRow> {
    const row = await this.repo.findRow(organizationId, id);
    if (!row) throw new AppError("Request not found", 404);
    return row;
  }

  private async activeItem(organizationId: string, id: string): Promise<ServiceCatalogItem> {
    const item = await this.deskRepo.findItem(organizationId, id);
    if (!item || !item.isActive) throw new AppError("That item is no longer in the catalog", 409);
    const category = await this.deskRepo.findCategory(organizationId, item.categoryId);
    if (!category || !category.isActive) throw new AppError("That item is no longer in the catalog", 409);
    return item;
  }

  private async snapshotOf(organizationId: string, item: ServiceCatalogItem): Promise<ItemSnapshot> {
    const [category, policy] = await Promise.all([
      this.deskRepo.findCategory(organizationId, item.categoryId),
      item.approvalMode === "policy" && item.approvalPolicyId
        ? this.approvalRepo.findPolicy(organizationId, item.approvalPolicyId)
        : Promise.resolve(null),
    ]);
    return {
      itemId: item.id,
      name: item.name,
      categoryKey: category?.key ?? "",
      categoryName: category?.name ?? "",
      formSchema: item.formSchema ?? [],
      approvalMode: item.approvalMode,
      version: item.version,
      riskLevel: item.riskLevel,
      approvalPolicyName: policy?.name ?? null,
      approvalHours: item.approvalHours,
      fulfilmentHours: item.fulfilmentHours,
      fulfilmentType: item.fulfilmentType ?? "manual",
      endpointId: item.fulfilmentType === "webhook" ? item.fulfilmentConfig?.endpointId ?? null : null,
      requiresIdentityCheck: item.requiresIdentityCheck ?? false,
      isPrivileged: item.isPrivileged ?? false,
    };
  }

  // A colleague (by id) or a new starter (name + email) — never both, and a
  // request "for" yourself is simply a request with no requested-for.
  private async requestedFor(
    organizationId: string,
    actor: DeskActor,
    body: { requestedForId?: string | null; requestedForName?: string | null; requestedForEmail?: string | null }
  ): Promise<RequestedFor> {
    const forId = body.requestedForId ?? null;
    if (forId) {
      if (forId === actor.id) return { requestedForId: null, requestedForName: null, requestedForEmail: null };
      const [person] = await this.deskRepo.peopleByIds(organizationId, [forId]);
      if (!person) throw new AppError("That colleague can't be found", 422, [{ field: "requestedForId", message: "Pick a colleague from the list" }]);
      return { requestedForId: forId, requestedForName: null, requestedForEmail: null };
    }
    const name = body.requestedForName ?? null;
    const email = body.requestedForEmail ?? null;
    if (!name && !email) return { requestedForId: null, requestedForName: null, requestedForEmail: null };
    if (!name) throw new AppError("Give the person's name", 422, [{ field: "requestedForName", message: "Give the person's name" }]);
    return { requestedForId: null, requestedForName: name, requestedForEmail: email };
  }

  // Turns the item's approval route into people (see domain/approvalPlan.ts).
  // Empty = no approval needed. Refuses the submission rather than letting a
  // request skip a step nobody can staff.
  async planFor(
    organizationId: string,
    item: Pick<ServiceCatalogItem, "approvalMode" | "approverIds" | "approvalPolicyId" | "name" | "riskLevel">,
    requesterId: string,
    requestedForId: string | null
  ): Promise<PlannedStep[]> {
    if (item.approvalMode === "none") return [];
    let steps: PolicyStep[];
    if (item.approvalMode === "policy") {
      const policy = item.approvalPolicyId ? await this.approvalRepo.findPolicy(organizationId, item.approvalPolicyId) : null;
      if (!policy) {
        throw new AppError(`"${item.name}" has no approval policy any more. Ask an administrator to fix it in Catalog setup.`, 409);
      }
      steps = policy.steps;
    } else {
      steps = stepsForApprovers(item.approverIds ?? []);
    }

    const usesManager = steps.some((s) => s.approvers.some((a) => a.type === "line_manager"));
    const [eligible, fallback, groups, delegations, lineManagerId] = await Promise.all([
      this.deskRepo.usersWithPermission(organizationId, [PERMS.CREATE, PERMS.MANAGE]),
      this.deskRepo.usersWithPermission(organizationId, [PERMS.MANAGE]),
      this.approvalRepo.listGroups(organizationId),
      this.approvalRepo.activeDelegations(organizationId),
      // The manager of whoever the request is for; for a new starter (no
      // account yet), the manager of the person asking on their behalf.
      usesManager ? this.approvalRepo.managerOf(organizationId, requestedForId ?? requesterId) : Promise.resolve(null),
    ]);

    try {
      return buildPlan(steps, {
        risk: item.riskLevel ?? "low",
        excluded: new Set([requesterId, requestedForId].filter(Boolean) as string[]),
        eligible: new Set(eligible.map((p) => p.id)),
        lineManagerId,
        groups: new Map(groups.map((g) => [g.id, { name: g.name, maxRiskLevel: g.maxRiskLevel, memberIds: g.memberIds }])),
        delegateOf: (userId) => delegations.get(userId) ?? null,
        fallbackIds: fallback.map((p) => p.id),
      });
    } catch (e) {
      if (e instanceof NoApproverError) {
        throw new AppError(
          `Nobody can approve "${item.name}" (${e.stepName}) yet. Ask an administrator to name approvers for it in Catalog setup.`,
          409
        );
      }
      throw e;
    }
  }

  // The people a request is about: who raised it, and who it's for.
  private async requesterSide(r: RequestRow): Promise<PersonRow[]> {
    const ids = [r.requesterId, r.requestedForId].filter(Boolean) as string[];
    return this.deskRepo.peopleByIds(r.organizationId, ids);
  }

  // Whoever the live approval step is waiting on (delegates included).
  private async notifyApprovers(r: RequestRow, exceptUserId: string) {
    const ids = await this.repo.pendingApproverIds(r.id);
    const people = await this.deskRepo.peopleByIds(r.organizationId, ids);
    const ref = formatReference(r.requestNumber);
    this.notifier.send(people, this.event(r, "approval", {
      title: `Approval needed: ${ref} ${r.title}`,
      heading: "An IT request needs your approval",
      body: `${r.requesterName} asked for "${r.itemSnapshot.name}" (${r.title}). You can approve it, reject it, or ask a question.`,
      note: r.businessJustification,
      noteLabel: "Business justification",
      ctaLabel: "Review the request",
    }), exceptUserId);
  }

  private notifyQueue(r: RequestRow, exceptUserId: string) {
    this.deskRepo
      .usersWithPermission(r.organizationId, [PERMS.WORK])
      .then((agents) =>
        this.notifier.send(agents, this.event(r, "queued", {
          title: `New IT request: ${formatReference(r.requestNumber)} ${r.title}`,
          heading: "A new IT request is ready",
          body: `${r.requesterName} needs "${r.itemSnapshot.name}" (${r.title}). Priority: ${r.priority}.`,
          ctaLabel: "Open the request",
        }), exceptUserId)
      )
      .catch((e: Error) => console.error("[serviceDesk] queue notification failed:", e.message));
  }

  private event(r: RequestRow, kind: DeskEvent["kind"], rest: Omit<DeskEvent, "kind" | "requestId" | "organizationId">): DeskEvent {
    return { kind, requestId: r.id, organizationId: r.organizationId, ...rest };
  }
}

// BR 1.5 / 2.5: an item that needs an identity check can't be worked until IT
// has recorded how they confirmed who is asking.
function assertIdentityChecked(r: Pick<ServiceRequest, "itemSnapshot" | "identityVerifiedAt">): void {
  if (r.itemSnapshot.requiresIdentityCheck && !r.identityVerifiedAt) {
    throw new AppError("Record how you confirmed the requester's identity first", 409);
  }
}

// IT may cancel what has reached it — and a request paused for information
// only if it had reached IT before the pause (not while still with approvers).
function canAgentCancel(r: Pick<ServiceRequest, "status" | "infoRequestedFrom">): boolean {
  if (!AGENT_CANCELLABLE.includes(r.status)) return false;
  return r.status !== "info_requested" || (!!r.infoRequestedFrom && AGENT_CANCELLABLE.includes(r.infoRequestedFrom));
}

function nameOf(actor: DeskActor): string {
  return [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || actor.email || "Someone";
}

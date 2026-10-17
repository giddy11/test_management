// modules/serviceDesk/services/serviceRequest.service.ts
// The life of an IT request: draft → submit → (approve | reject) → start →
// fulfil, or cancel along the way. See domain/lifecycle.ts for the table.
//
// Who may do what:
//   requester            create, edit a draft, submit, cancel before IT starts
//   requested-for person read and comment (it's about them)
//   approver             decide — because the item named them, not because of
//                        a role (approving is deliberately not a permission)
//   servicedesk.work     see the queue, assign, start, fulfil, cancel with a
//                        reason, write internal notes
// A requester never approves their own request, nor one raised for them.
import type { EntityManager } from "typeorm";
import { ServiceRequestRepository, type RequestRow } from "../repositories/serviceRequest.repository";
import { ServiceDeskRepository, type PersonRow } from "../repositories/serviceDesk.repository";
import { ServiceDeskService, PERMS, type DeskActor } from "./serviceDesk.service";
import { ServiceDeskNotifier, type DeskEvent } from "./serviceDeskNotifier";
import type { ItemSnapshot, ServiceRequest } from "../entities/serviceRequest.entity";
import type { ServiceCatalogItem } from "../entities/serviceCatalogItem.entity";
import { validateFormValues } from "../domain/formSchema";
import {
  AGENT_CANCELLABLE,
  READY_FOR_FULFILMENT,
  REQUESTER_CANCELLABLE,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  assertTransition,
  formatReference,
  outcomeOfDecision,
  parseReference,
  statusOnSubmit,
  type RequestStatus,
} from "../domain/lifecycle";
import { toRequestDto } from "../dto/serviceDesk.dto";
import type { CreateRequestBody, ListApprovalsQuery, ListRequestsQuery, UpdateDraftBody } from "../validators/serviceDesk.schema";

const { AppError } = require("../../../shared/errors/AppError");
const { can } = require("../../../shared/access/can");
const { ActivityService } = require("../../activity/services/activity.service");

type RequestedFor = Pick<ServiceRequest, "requestedForId" | "requestedForName" | "requestedForEmail">;

const OPEN_VIEW: RequestStatus[] = ["submitted", "pending_approval", "approved", "in_progress"];

export class ServiceRequestService {
  static Instance = new ServiceRequestService();

  constructor(
    private readonly repo = ServiceRequestRepository.Instance,
    private readonly desk = ServiceDeskService.Instance,
    private readonly deskRepo = ServiceDeskRepository.Instance,
    private readonly notifier = ServiceDeskNotifier.Instance,
    private readonly activity = ActivityService.Instance
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

    const approvers = body.submit ? await this.resolveApprovers(organizationId, item, actor.id, requestedFor.requestedForId) : [];
    const status: RequestStatus = body.submit ? statusOnSubmit(approvers.length > 0) : "draft";
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
        priority: body.priority,
        formValues: values,
        status,
        submittedAt: body.submit ? now : null,
        statusUpdatedAt: now,
      });
      await this.repo.addHistory(m, { requestId: row.id, fromStatus: null, toStatus: status, actorId: actor.id });
      if (body.submit) await this.recordSubmission(m, actor, row, approvers);
      return row;
    });

    const fresh = await this.mustFindRow(organizationId, saved.id);
    if (body.submit) this.announceSubmission(actor, fresh, approvers);
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

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked || locked.status !== "draft") throw new AppError("Only a draft can be edited", 409);
      await this.repo.update(m, id, {
        catalogItemId: item.id,
        itemSnapshot: await this.snapshotOf(organizationId, item),
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
    // while the form or its approvers changed.
    const item = await this.activeItem(organizationId, current.catalogItemId);
    const { values, errors } = validateFormValues(item.formSchema, current.formValues);
    if (errors.length) throw new AppError("Some answers need another look", 422, errors);
    const approvers = await this.resolveApprovers(organizationId, item, actor.id, current.requestedForId);
    const status = statusOnSubmit(approvers.length > 0);
    const snapshot = await this.snapshotOf(organizationId, item);

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked || locked.status !== "draft") throw new AppError("This request has already been submitted", 409);
      assertTransition("draft", status);
      const now = new Date();
      await this.repo.update(m, id, { status, itemSnapshot: snapshot, formValues: values, submittedAt: now, statusUpdatedAt: now });
      await this.repo.addHistory(m, { requestId: id, fromStatus: "draft", toStatus: status, actorId: actor.id });
      await this.recordSubmission(m, actor, { ...locked, status }, approvers);
    });

    const fresh = await this.mustFindRow(organizationId, id);
    this.announceSubmission(actor, fresh, approvers);
    return toRequestDto(fresh);
  }

  private async recordSubmission(m: EntityManager, actor: DeskActor, row: ServiceRequest, approvers: PersonRow[]) {
    await this.repo.addApprovals(m, row.id, approvers.map((a) => a.id));
    await this.repo.addAudit(
      m,
      this.activity.buildEntry(actor, {
        action: "service_request.submitted",
        summary: `Submitted IT request ${formatReference(row.requestNumber)} "${row.title}"`,
        entityType: "service_request",
        entityId: row.id,
        metadata: { status: row.status, approverIds: approvers.map((a) => a.id) },
      })
    );
  }

  private announceSubmission(actor: DeskActor, r: RequestRow, approvers: PersonRow[]) {
    const ref = formatReference(r.requestNumber);
    if (r.status === "pending_approval") {
      this.notifier.send(approvers, this.event(r, "approval", {
        title: `Approval needed: ${ref} ${r.title}`,
        heading: "An IT request needs your approval",
        body: `${r.requesterName} asked for "${r.itemSnapshot.name}" (${r.title}). You can approve or reject it.`,
        note: r.businessJustification,
        noteLabel: "Business justification",
        ctaLabel: "Review the request",
      }), actor.id);
      return;
    }
    this.notifyQueue(r, actor.id);
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
    const next = outcomeOfDecision(decision);

    await this.repo.run(async (m) => {
      const locked = await this.repo.lock(m, organizationId, id);
      if (!locked) throw new AppError("Request not found", 404);
      const mine = (await this.repo.approvalsOf(m, id)).filter((a) => a.approverId === actor.id);
      if (!mine.length) throw new AppError("You are not an approver for this request", 403);
      const pending = mine.find((a) => a.decision === "pending");
      if (locked.status !== "pending_approval" || !pending) {
        throw new AppError(`This request is already ${STATUS_LABELS[locked.status].toLowerCase()}`, 409);
      }
      assertTransition(locked.status, next);
      const now = new Date();
      await this.repo.decide(m, pending.id, decision, comment);
      await this.repo.skipPending(m, id);
      await this.repo.update(m, id, { status: next, statusUpdatedAt: now, ...(decision === "approved" && { approvedAt: now }) });
      await this.repo.addHistory(m, { requestId: id, fromStatus: locked.status, toStatus: next, actorId: actor.id, note: comment });
      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: `service_request.${decision}`,
          summary: `${decision === "approved" ? "Approved" : "Rejected"} IT request ${formatReference(locked.requestNumber)} "${locked.title}"`,
          entityType: "service_request",
          entityId: id,
          metadata: { comment },
        })
      );
    });

    const r = await this.mustFindRow(organizationId, id);
    const ref = formatReference(r.requestNumber);
    const decider = nameOf(actor);
    this.notifier.send(await this.requesterSide(r), this.event(r, "update", decision === "approved"
      ? {
          title: `Approved: ${ref} ${r.title}`,
          heading: "Your IT request was approved",
          body: `${decider} approved your request "${r.title}". It's now with IT.`,
          note: comment,
          noteLabel: "Comment",
          ctaLabel: "View the request",
        }
      : {
          title: `Rejected: ${ref} ${r.title}`,
          heading: "Your IT request was rejected",
          body: `${decider} rejected your request "${r.title}".`,
          note: comment,
          noteLabel: "Reason",
          ctaLabel: "View the request",
        }), actor.id);
    if (decision === "approved") this.notifyQueue(r, actor.id);
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
      if (approvals.some((a) => a.decision === "pending" || a.decision === "rejected")) {
        throw new AppError("This request has not been approved", 409);
      }
      assertTransition(locked.status, "in_progress");
      const now = new Date();
      await this.repo.update(m, id, {
        status: "in_progress",
        startedAt: now,
        statusUpdatedAt: now,
        assigneeId: locked.assigneeId ?? actor.id,
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
      assertTransition(locked.status, "fulfilled");
      const now = new Date();
      await this.repo.update(m, id, { status: "fulfilled", fulfilledAt: now, statusUpdatedAt: now, resolutionNote: note });
      await this.repo.addHistory(m, { requestId: id, fromStatus: "in_progress", toStatus: "fulfilled", actorId: actor.id, note });
      await this.repo.addAudit(
        m,
        this.activity.buildEntry(actor, {
          action: "service_request.fulfilled",
          summary: `Fulfilled IT request ${formatReference(locked.requestNumber)} "${locked.title}"`,
          entityType: "service_request",
          entityId: id,
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
      const byAgent = !byRequester && isAgent && AGENT_CANCELLABLE.includes(locked.status);
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
      await this.repo.skipPending(m, id);
      await this.repo.update(m, id, {
        status: "cancelled",
        cancelledAt: now,
        statusUpdatedAt: now,
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
      assignee: q.scope === "queue" ? q.assignee : undefined,
      search: q.search,
      requestNumber: q.search ? parseReference(q.search) : null,
      page: q.page,
      limit: q.limit,
    });
    return { data: data.map(toRequestDto), meta };
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
    return { data: data.map(toRequestDto), meta };
  }

  async counts(actor: DeskActor) {
    const organizationId = this.desk.orgOf(actor);
    if (!(await this.desk.isEnabled(organizationId))) return { pendingApprovals: 0, queue: null };
    return this.repo.counts(organizationId, actor.id, can(actor, PERMS.WORK));
  }

  async detail(actor: DeskActor, id: string) {
    const organizationId = this.desk.orgOf(actor);
    await this.desk.assertEnabled(organizationId);
    const r = await this.mustFindRow(organizationId, id);
    const viewer = await this.viewerOf(actor, r);
    if (!viewer.visible) throw new AppError("Request not found", 404);

    const [approvals, history, comments, item] = await Promise.all([
      this.repo.approvalRows(id),
      this.repo.historyRows(id),
      this.repo.commentRows(id, viewer.isAgent),
      viewer.isAgent && r.catalogItemId ? this.deskRepo.findItem(organizationId, r.catalogItemId) : Promise.resolve(null),
    ]);
    const myPending = approvals.find((a) => a.approverId === actor.id && a.decision === "pending");
    const isRequesterSelf = r.requesterId === actor.id;

    return {
      request: toRequestDto(r),
      approvals,
      history,
      comments,
      // IT's own instructions for this kind of request — agents only.
      fulfilmentNotes: viewer.isAgent ? item?.fulfilmentNotes ?? null : null,
      viewer: {
        isRequester: viewer.isRequester,
        isApprover: viewer.isApprover,
        isAgent: viewer.isAgent,
        canEdit: isRequesterSelf && r.status === "draft",
        canDecide: !!myPending && r.status === "pending_approval",
        canCancel:
          (isRequesterSelf && REQUESTER_CANCELLABLE.includes(r.status)) ||
          (viewer.isAgent && AGENT_CANCELLABLE.includes(r.status)),
        cancelNeedsReason: !(isRequesterSelf && REQUESTER_CANCELLABLE.includes(r.status)),
        canAssign: viewer.isAgent && r.status !== "draft" && !TERMINAL_STATUSES.includes(r.status),
        canStart: viewer.isAgent && READY_FOR_FULFILMENT.includes(r.status),
        canFulfil: viewer.isAgent && r.status === "in_progress",
        canComment: viewer.visible && r.status !== "draft",
        canAddInternalNote: viewer.isAgent && r.status !== "draft",
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
    const category = await this.deskRepo.findCategory(organizationId, item.categoryId);
    return {
      itemId: item.id,
      name: item.name,
      categoryKey: category?.key ?? "",
      categoryName: category?.name ?? "",
      formSchema: item.formSchema ?? [],
      approvalMode: item.approvalMode,
      version: item.version,
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

  // Who decides. Any one of the item's named approvers — minus the requester
  // and the person it's for — or, when the item names nobody eligible, the
  // organisation's servicedesk.manage holders. Never empty for an item that
  // needs approval: better to refuse the submission than to let it through.
  async resolveApprovers(
    organizationId: string,
    item: Pick<ServiceCatalogItem, "approvalMode" | "approverIds" | "name">,
    requesterId: string,
    requestedForId: string | null
  ): Promise<PersonRow[]> {
    if (item.approvalMode !== "approvers") return [];
    const excluded = new Set([requesterId, requestedForId].filter(Boolean) as string[]);
    const named = new Set(item.approverIds ?? []);
    const eligible = (await this.deskRepo.usersWithPermission(organizationId, [PERMS.CREATE, PERMS.MANAGE])).filter(
      (p) => named.has(p.id) && !excluded.has(p.id)
    );
    if (eligible.length) return eligible;
    const fallback = (await this.deskRepo.usersWithPermission(organizationId, [PERMS.MANAGE])).filter((p) => !excluded.has(p.id));
    if (fallback.length) return fallback;
    throw new AppError(
      `Nobody can approve "${item.name}" yet. Ask an administrator to name approvers for it in Catalog setup.`,
      409
    );
  }

  // The people a request is about: who raised it, and who it's for.
  private async requesterSide(r: RequestRow): Promise<PersonRow[]> {
    const ids = [r.requesterId, r.requestedForId].filter(Boolean) as string[];
    return this.deskRepo.peopleByIds(r.organizationId, ids);
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

function nameOf(actor: DeskActor): string {
  return [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || actor.email || "Someone";
}


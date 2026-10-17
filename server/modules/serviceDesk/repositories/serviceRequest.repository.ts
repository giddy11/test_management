// modules/serviceDesk/repositories/serviceRequest.repository.ts
// IT requests and everything hanging off them.
//
// Writes that change a request's status run inside `run()` with the request
// row locked (`lock`) — two approvers clicking at once, or an agent starting
// a request the requester is cancelling, are serialised by Postgres and the
// loser sees the new status instead of overwriting it. The status-history
// row and the audit entry go in the same transaction, so the three never
// disagree about what happened.
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { ServiceRequest } from "../entities/serviceRequest.entity";
import { ServiceRequestApproval } from "../entities/serviceRequestApproval.entity";
import { ServiceRequestStatusHistory } from "../entities/serviceRequestStatusHistory.entity";
import { ServiceRequestComment } from "../entities/serviceRequestComment.entity";
import { ServiceRequestAttachment } from "../entities/serviceRequestAttachment.entity";
import type { ApprovalDecision, RequestStatus } from "../domain/lifecycle";
import type { PlannedStep, StepMode } from "../domain/approvalPlan";

const { ActivityLog } = require("../../activity/entities/activityLog.entity");
const { getOffset, buildMetaFromTotal } = require("../../../shared/pagination/paginate");

// A request plus the names a list or detail view shows next to it.
export interface RequestRow extends ServiceRequest {
  requesterName: string;
  requesterEmail: string;
  requestedForUserName: string | null;
  requestedForUserEmail: string | null;
  assigneeName: string | null;
}

export interface ApprovalRow {
  id: string;
  stepOrder: number;
  stepName: string | null;
  stepMode: StepMode;
  ruleIndex: number;
  approverId: string;
  approverName: string;
  groupId: string | null;
  groupName: string | null;
  isFallback: boolean;
  onBehalfOfId: string | null;
  onBehalfOfName: string | null;
  decision: ApprovalDecision;
  comment: string | null;
  decidedAt: Date | null;
  decidedById: string | null;
  decidedByName: string | null;
  authorityLevel: string | null;
}

export interface HistoryRow {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorName: string | null;
  note: string | null;
  createdAt: Date;
}

export interface CommentRow {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}

export interface AttachmentRow {
  id: string;
  fileName: string;
  fileUrl: string;
  resourceType: "image" | "raw";
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: Date;
}

export interface RequestListFilter {
  organizationId: string;
  userId: string;
  scope: "mine" | "queue" | "approvals";
  statuses?: readonly RequestStatus[];
  overdue?: boolean;
  assignee?: "me" | "unassigned" | string;
  approvalState?: "pending" | "decided";
  requestNumber?: number | null;
  search?: string;
  page: number;
  limit: number;
}

// A request past its service level, as the sweeper sees it.
export interface OverdueRow {
  id: string;
  organizationId: string;
  phase: "approval" | "fulfilment";
  stepOrder: number;
  dueAt: Date;
  targetHours: number;
  level: number;
}

const name = (alias: string) => `NULLIF(TRIM(CONCAT(${alias}."first_name", ' ', ${alias}."last_name")), '')`;

// Someone may act on an approval row that is theirs, or one belonging to a
// colleague who has delegated to them for today.
export const ACTS_FOR = (row: string, user: string) => `(
  ${row}."approver_id" = ${user}
  OR EXISTS (
    SELECT 1 FROM "service_approval_delegations" dl
     WHERE dl."user_id" = ${row}."approver_id" AND dl."delegate_id" = ${user}
       AND CURRENT_DATE BETWEEN dl."starts_on" AND dl."ends_on"
  )
)`;

const REQUEST_SELECT = `
  r."id", r."request_number" AS "requestNumber", r."organization_id" AS "organizationId",
  r."catalog_item_id" AS "catalogItemId", r."item_snapshot" AS "itemSnapshot",
  r."requester_id" AS "requesterId", r."requested_for_id" AS "requestedForId",
  r."requested_for_name" AS "requestedForName", r."requested_for_email" AS "requestedForEmail",
  r."title", r."description", r."business_justification" AS "businessJustification",
  r."priority", r."form_values" AS "formValues", r."status", r."assignee_id" AS "assigneeId",
  r."resolution_note" AS "resolutionNote", r."submitted_at" AS "submittedAt",
  r."approved_at" AS "approvedAt", r."started_at" AS "startedAt", r."fulfilled_at" AS "fulfilledAt",
  r."cancelled_at" AS "cancelledAt", r."status_updated_at" AS "statusUpdatedAt",
  r."risk_level" AS "riskLevel", r."current_step" AS "currentStep",
  r."approval_due_at" AS "approvalDueAt", r."approval_target_hours" AS "approvalTargetHours",
  r."approval_escalation_level" AS "approvalEscalationLevel",
  r."fulfilment_due_at" AS "fulfilmentDueAt", r."fulfilment_target_hours" AS "fulfilmentTargetHours",
  r."fulfilment_escalation_level" AS "fulfilmentEscalationLevel",
  r."info_requested_at" AS "infoRequestedAt", r."info_requested_from" AS "infoRequestedFrom",
  r."info_requested_by_id" AS "infoRequestedById",
  r."created_at" AS "createdAt", r."updated_at" AS "updatedAt",
  COALESCE(${name("rq")}, rq."email") AS "requesterName", rq."email" AS "requesterEmail",
  COALESCE(${name("rf")}, rf."email") AS "requestedForUserName", rf."email" AS "requestedForUserEmail",
  COALESCE(${name("a")}, a."email") AS "assigneeName"`;

const REQUEST_FROM = `
  FROM "service_requests" r
  JOIN "users" rq ON rq."id" = r."requester_id"
  LEFT JOIN "users" rf ON rf."id" = r."requested_for_id"
  LEFT JOIN "users" a ON a."id" = r."assignee_id"`;

// Past due right now, in whichever phase the request is in.
const OVERDUE = `(
  (r."status" = 'pending_approval' AND r."approval_due_at" < now())
  OR (r."status" IN ('submitted', 'approved', 'in_progress') AND r."fulfilment_due_at" < now())
)`;

export class ServiceRequestRepository {
  static Instance = new ServiceRequestRepository();

  // ── Transactions ───────────────────────────────────────────────────────────
  run<T>(work: (m: EntityManager) => Promise<T>): Promise<T> {
    return AppDataSource.transaction(work);
  }

  async lock(m: EntityManager, organizationId: string, id: string): Promise<ServiceRequest | null> {
    return m.getRepository(ServiceRequest).findOne({
      where: { organizationId, id },
      lock: { mode: "pessimistic_write" },
    });
  }

  async insert(m: EntityManager, row: Partial<ServiceRequest>): Promise<ServiceRequest> {
    const repo = m.getRepository(ServiceRequest);
    return repo.save(repo.create(row));
  }

  async update(m: EntityManager, id: string, patch: Partial<ServiceRequest>): Promise<void> {
    await m.getRepository(ServiceRequest).update({ id }, patch as never);
  }

  async addHistory(m: EntityManager, row: Partial<ServiceRequestStatusHistory>): Promise<void> {
    await m.insert(ServiceRequestStatusHistory, row);
  }

  // The whole approval plan at once: the first step's rows are live
  // ("pending"), every later step's are "waiting".
  async insertPlan(m: EntityManager, requestId: string, plan: PlannedStep[]): Promise<void> {
    const rows = plan.flatMap((step) =>
      step.approvers.map((a) => ({
        requestId,
        stepOrder: step.order,
        stepName: step.name,
        stepMode: step.mode,
        ruleIndex: a.ruleIndex,
        approverId: a.userId,
        groupId: a.groupId,
        isFallback: a.isFallback,
        onBehalfOfId: a.onBehalfOfId,
        decision: (step.order === 1 ? "pending" : "waiting") as ApprovalDecision,
      }))
    );
    if (rows.length) await m.insert(ServiceRequestApproval, rows);
  }

  async approvalsOf(m: EntityManager, requestId: string): Promise<ServiceRequestApproval[]> {
    return m.getRepository(ServiceRequestApproval).find({ where: { requestId }, order: { stepOrder: "ASC" } });
  }

  async decide(
    m: EntityManager,
    approvalId: string,
    patch: { decision: "approved" | "rejected"; comment: string | null; decidedById: string; authorityLevel: string | null }
  ) {
    await m.getRepository(ServiceRequestApproval).update({ id: approvalId }, { ...patch, decidedAt: new Date() } as never);
  }

  async skipRows(m: EntityManager, ids: string[]): Promise<void> {
    if (!ids.length) return;
    await m.query(`UPDATE "service_request_approvals" SET "decision" = 'skipped' WHERE "id" = ANY($1::uuid[])`, [ids]);
  }

  async activateStep(m: EntityManager, requestId: string, stepOrder: number): Promise<void> {
    await m.query(
      `UPDATE "service_request_approvals" SET "decision" = 'pending'
        WHERE "request_id" = $1 AND "step_order" = $2 AND "decision" = 'waiting'`,
      [requestId, stepOrder]
    );
  }

  // Whatever hasn't been decided is no longer needed — the request was
  // decided, or withdrawn.
  async skipUndecided(m: EntityManager, requestId: string): Promise<void> {
    await m.query(
      `UPDATE "service_request_approvals" SET "decision" = 'skipped'
        WHERE "request_id" = $1 AND "decision" IN ('pending', 'waiting')`,
      [requestId]
    );
  }

  async addAudit(m: EntityManager, entry: Record<string, unknown>): Promise<void> {
    await m.insert(ActivityLog, entry);
  }

  async addComment(row: Partial<ServiceRequestComment>, m?: EntityManager): Promise<ServiceRequestComment> {
    const repo = (m ?? AppDataSource.manager).getRepository(ServiceRequestComment);
    return repo.save(repo.create(row));
  }

  // ── Attachments ────────────────────────────────────────────────────────────
  async addAttachments(rows: Partial<ServiceRequestAttachment>[]): Promise<ServiceRequestAttachment[]> {
    const repo = AppDataSource.getRepository(ServiceRequestAttachment);
    return repo.save(repo.create(rows));
  }

  async countAttachments(requestId: string): Promise<number> {
    return AppDataSource.getRepository(ServiceRequestAttachment).count({ where: { requestId } });
  }

  async findAttachment(requestId: string, id: string): Promise<ServiceRequestAttachment | null> {
    return AppDataSource.getRepository(ServiceRequestAttachment).findOne({ where: { requestId, id } });
  }

  async deleteAttachment(id: string): Promise<void> {
    await AppDataSource.getRepository(ServiceRequestAttachment).delete({ id });
  }

  async attachmentRows(requestId: string): Promise<AttachmentRow[]> {
    return AppDataSource.query(
      `SELECT f."id", f."file_name" AS "fileName", f."file_url" AS "fileUrl", f."resource_type" AS "resourceType",
              f."mime_type" AS "mimeType", f."file_size_bytes" AS "fileSizeBytes",
              f."uploaded_by_id" AS "uploadedById", COALESCE(${name("u")}, u."email") AS "uploadedByName",
              f."created_at" AS "createdAt"
         FROM "service_request_attachments" f
         LEFT JOIN "users" u ON u."id" = f."uploaded_by_id"
        WHERE f."request_id" = $1
        ORDER BY f."created_at" ASC`,
      [requestId]
    );
  }

  // ── Reads ──────────────────────────────────────────────────────────────────
  async findRow(organizationId: string, id: string): Promise<RequestRow | null> {
    const rows = await AppDataSource.query(
      `SELECT ${REQUEST_SELECT} ${REQUEST_FROM} WHERE r."organization_id" = $1 AND r."id" = $2`,
      [organizationId, id]
    );
    return rows[0] ?? null;
  }

  async list(f: RequestListFilter): Promise<{ data: RequestRow[]; meta: unknown }> {
    const params: unknown[] = [f.organizationId, f.userId];
    const where: string[] = [`r."organization_id" = $1`];

    if (f.scope === "mine") {
      where.push(`(r."requester_id" = $2 OR (r."requested_for_id" = $2 AND r."status" <> 'draft'))`);
    } else if (f.scope === "queue") {
      where.push(`r."status" <> 'draft'`);
    } else if (f.approvalState === "decided") {
      where.push(`EXISTS (
        SELECT 1 FROM "service_request_approvals" ap
         WHERE ap."request_id" = r."id" AND ap."decision" IN ('approved', 'rejected')
           AND (ap."decided_by_id" = $2 OR (ap."decided_by_id" IS NULL AND ap."approver_id" = $2))
      )`);
    } else {
      where.push(`EXISTS (
        SELECT 1 FROM "service_request_approvals" ap
         WHERE ap."request_id" = r."id" AND ap."decision" = 'pending' AND ${ACTS_FOR("ap", "$2")}
      )`);
    }

    if (f.statuses?.length) {
      params.push(f.statuses);
      where.push(`r."status" = ANY($${params.length}::varchar[])`);
    }
    if (f.overdue) where.push(OVERDUE);
    if (f.assignee === "me") where.push(`r."assignee_id" = $2`);
    else if (f.assignee === "unassigned") where.push(`r."assignee_id" IS NULL`);
    else if (f.assignee) {
      params.push(f.assignee);
      where.push(`r."assignee_id" = $${params.length}`);
    }
    if (f.search) {
      params.push(`%${f.search}%`);
      const titleMatch = `r."title" ILIKE $${params.length}`;
      if (f.requestNumber) {
        params.push(f.requestNumber);
        where.push(`(${titleMatch} OR r."request_number" = $${params.length})`);
      } else {
        where.push(titleMatch);
      }
    }

    params.push(f.limit, getOffset(f.page, f.limit));
    const rows = await AppDataSource.query(
      `SELECT ${REQUEST_SELECT}, COUNT(*) OVER() AS "totalCount"
         ${REQUEST_FROM}
        WHERE ${where.join(" AND ")}
        ORDER BY ${f.overdue ? `COALESCE(r."approval_due_at", r."fulfilment_due_at") ASC` : `r."created_at" DESC`}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const total = rows.length ? Number(rows[0].totalCount) : 0;
    return { data: rows, meta: buildMetaFromTotal(f.page, f.limit, total) };
  }

  // Badge numbers for the sidebar and the queue tabs.
  async counts(organizationId: string, userId: string, includeQueue: boolean) {
    const [approvals] = await AppDataSource.query(
      `SELECT COUNT(DISTINCT r."id")::int AS "n"
         FROM "service_request_approvals" ap
         JOIN "service_requests" r ON r."id" = ap."request_id"
        WHERE r."organization_id" = $1 AND ap."decision" = 'pending' AND r."status" = 'pending_approval'
          AND ${ACTS_FOR("ap", "$2")}`,
      [organizationId, userId]
    );
    if (!includeQueue) return { pendingApprovals: approvals.n as number, queue: null };
    const [queue] = await AppDataSource.query(
      `SELECT COUNT(*) FILTER (WHERE r."status" IN ('submitted', 'approved'))::int AS "ready",
              COUNT(*) FILTER (WHERE r."status" IN ('submitted', 'approved') AND r."assignee_id" IS NULL)::int AS "unassigned",
              COUNT(*) FILTER (WHERE r."status" = 'in_progress' AND r."assignee_id" = $2)::int AS "mine",
              COUNT(*) FILTER (WHERE r."status" = 'pending_approval')::int AS "awaitingApproval",
              COUNT(*) FILTER (WHERE r."status" = 'info_requested')::int AS "waitingOnRequester",
              COUNT(*) FILTER (WHERE ${OVERDUE})::int AS "overdue"
         FROM "service_requests" r WHERE r."organization_id" = $1`,
      [organizationId, userId]
    );
    return { pendingApprovals: approvals.n as number, queue };
  }

  async approvalRows(requestId: string): Promise<ApprovalRow[]> {
    return AppDataSource.query(
      `SELECT ap."id", ap."step_order" AS "stepOrder", ap."step_name" AS "stepName", ap."step_mode" AS "stepMode",
              ap."rule_index" AS "ruleIndex", ap."approver_id" AS "approverId",
              COALESCE(${name("u")}, u."email") AS "approverName",
              ap."group_id" AS "groupId", g."name" AS "groupName", ap."is_fallback" AS "isFallback",
              ap."on_behalf_of_id" AS "onBehalfOfId", COALESCE(${name("ob")}, ob."email") AS "onBehalfOfName",
              ap."decision", ap."comment", ap."decided_at" AS "decidedAt",
              ap."decided_by_id" AS "decidedById", COALESCE(${name("db")}, db."email") AS "decidedByName",
              ap."authority_level" AS "authorityLevel"
         FROM "service_request_approvals" ap
         JOIN "users" u ON u."id" = ap."approver_id"
         LEFT JOIN "service_approver_groups" g ON g."id" = ap."group_id"
         LEFT JOIN "users" ob ON ob."id" = ap."on_behalf_of_id"
         LEFT JOIN "users" db ON db."id" = ap."decided_by_id"
        WHERE ap."request_id" = $1
        ORDER BY ap."step_order" ASC, ap."rule_index" ASC, ap."decided_at" ASC NULLS LAST, "approverName" ASC`,
      [requestId]
    );
  }

  async historyRows(requestId: string): Promise<HistoryRow[]> {
    return AppDataSource.query(
      `SELECT h."id", h."from_status" AS "fromStatus", h."to_status" AS "toStatus",
              COALESCE(${name("u")}, u."email") AS "actorName", h."note", h."created_at" AS "createdAt"
         FROM "service_request_status_history" h
         LEFT JOIN "users" u ON u."id" = h."actor_id"
        WHERE h."request_id" = $1
        ORDER BY h."created_at" ASC`,
      [requestId]
    );
  }

  async commentRows(requestId: string, includeInternal: boolean): Promise<CommentRow[]> {
    return AppDataSource.query(
      `SELECT c."id", c."author_id" AS "authorId", COALESCE(${name("u")}, u."email") AS "authorName",
              c."body", c."is_internal" AS "isInternal", c."created_at" AS "createdAt"
         FROM "service_request_comments" c
         LEFT JOIN "users" u ON u."id" = c."author_id"
        WHERE c."request_id" = $1 ${includeInternal ? "" : `AND c."is_internal" = false`}
        ORDER BY c."created_at" ASC`,
      [requestId]
    );
  }

  // Has this person had (or got, through delegation) a say on the request?
  async isApprover(requestId: string, userId: string): Promise<boolean> {
    const rows = await AppDataSource.query(
      `SELECT 1 FROM "service_request_approvals" ap
        WHERE ap."request_id" = $1
          AND (ap."decided_by_id" = $2 OR (ap."decision" <> 'waiting' AND ${ACTS_FOR("ap", "$2")}))
        LIMIT 1`,
      [requestId, userId]
    );
    return rows.length > 0;
  }

  // ── Escalation ─────────────────────────────────────────────────────────────

  // Requests past due in either phase, across every organisation with IT
  // requests switched on. The sweeper decides which level each should be at.
  async overdue(limit: number): Promise<OverdueRow[]> {
    return AppDataSource.query(
      `SELECT r."id", r."organization_id" AS "organizationId", 'approval' AS "phase",
              COALESCE(r."current_step", 1) AS "stepOrder", r."approval_due_at" AS "dueAt",
              COALESCE(r."approval_target_hours", 48) AS "targetHours", r."approval_escalation_level" AS "level"
         FROM "service_requests" r
         JOIN "service_desk_settings" s ON s."organization_id" = r."organization_id" AND s."enabled" = true
        WHERE r."status" = 'pending_approval' AND r."approval_due_at" < now() AND r."approval_escalation_level" < 3
       UNION ALL
       SELECT r."id", r."organization_id", 'fulfilment', 0, r."fulfilment_due_at",
              COALESCE(r."fulfilment_target_hours", 72), r."fulfilment_escalation_level"
         FROM "service_requests" r
         JOIN "service_desk_settings" s ON s."organization_id" = r."organization_id" AND s."enabled" = true
        WHERE r."status" IN ('submitted', 'approved', 'in_progress')
          AND r."fulfilment_due_at" < now() AND r."fulfilment_escalation_level" < 3
        LIMIT $1`,
      [limit]
    );
  }

  // Records the escalation and moves the level up — only if nobody else got
  // there first. Returns false when this escalation was already sent.
  async recordEscalation(
    m: EntityManager,
    row: OverdueRow,
    level: number,
    notifiedUserIds: string[],
    audit: Record<string, unknown>
  ): Promise<boolean> {
    const inserted = await m.query(
      `INSERT INTO "service_request_escalations" ("request_id", "phase", "step_order", "level", "notified_user_ids")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT "uq_service_request_escalations_once" DO NOTHING
       RETURNING "id"`,
      [row.id, row.phase, row.stepOrder, level, notifiedUserIds]
    );
    const column = row.phase === "approval" ? "approval_escalation_level" : "fulfilment_escalation_level";
    await m.query(`UPDATE "service_requests" SET "${column}" = GREATEST("${column}", $2) WHERE "id" = $1`, [row.id, level]);
    if (!inserted.length) return false;
    await m.insert(ActivityLog, audit);
    return true;
  }

  // Who is holding an approval step up right now (including delegates).
  async pendingApproverIds(requestId: string): Promise<string[]> {
    const rows: { id: string }[] = await AppDataSource.query(
      `SELECT DISTINCT ap."approver_id" AS "id" FROM "service_request_approvals" ap
        WHERE ap."request_id" = $1 AND ap."decision" = 'pending'
       UNION
       SELECT DISTINCT dl."delegate_id" FROM "service_request_approvals" ap
         JOIN "service_approval_delegations" dl ON dl."user_id" = ap."approver_id"
          AND CURRENT_DATE BETWEEN dl."starts_on" AND dl."ends_on"
        WHERE ap."request_id" = $1 AND ap."decision" = 'pending'`,
      [requestId]
    );
    return rows.map((r) => r.id);
  }
}

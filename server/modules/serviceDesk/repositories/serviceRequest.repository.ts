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
import type { ApprovalDecision, RequestStatus } from "../domain/lifecycle";

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
  approverId: string;
  approverName: string;
  decision: ApprovalDecision;
  comment: string | null;
  decidedAt: Date | null;
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

export interface RequestListFilter {
  organizationId: string;
  userId: string;
  scope: "mine" | "queue" | "approvals";
  statuses?: readonly RequestStatus[];
  assignee?: "me" | "unassigned" | string;
  approvalState?: "pending" | "decided";
  requestNumber?: number | null;
  search?: string;
  page: number;
  limit: number;
}

const name = (alias: string) => `NULLIF(TRIM(CONCAT(${alias}."first_name", ' ', ${alias}."last_name")), '')`;

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
  r."created_at" AS "createdAt", r."updated_at" AS "updatedAt",
  COALESCE(${name("rq")}, rq."email") AS "requesterName", rq."email" AS "requesterEmail",
  COALESCE(${name("rf")}, rf."email") AS "requestedForUserName", rf."email" AS "requestedForUserEmail",
  COALESCE(${name("a")}, a."email") AS "assigneeName"`;

const REQUEST_FROM = `
  FROM "service_requests" r
  JOIN "users" rq ON rq."id" = r."requester_id"
  LEFT JOIN "users" rf ON rf."id" = r."requested_for_id"
  LEFT JOIN "users" a ON a."id" = r."assignee_id"`;

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

  async addApprovals(m: EntityManager, requestId: string, approverIds: string[]): Promise<void> {
    if (!approverIds.length) return;
    await m.insert(
      ServiceRequestApproval,
      approverIds.map((approverId) => ({ requestId, approverId, stepOrder: 1, decision: "pending" as const }))
    );
  }

  async approvalsOf(m: EntityManager, requestId: string): Promise<ServiceRequestApproval[]> {
    return m.getRepository(ServiceRequestApproval).find({ where: { requestId } });
  }

  async decide(m: EntityManager, approvalId: string, decision: "approved" | "rejected", comment: string | null) {
    await m.getRepository(ServiceRequestApproval).update({ id: approvalId }, { decision, comment, decidedAt: new Date() });
  }

  // Whatever is still pending is no longer needed — the request was decided,
  // or withdrawn.
  async skipPending(m: EntityManager, requestId: string): Promise<void> {
    await m.getRepository(ServiceRequestApproval).update({ requestId, decision: "pending" }, { decision: "skipped" });
  }

  async addAudit(m: EntityManager, entry: Record<string, unknown>): Promise<void> {
    await m.insert(ActivityLog, entry);
  }

  async addComment(row: Partial<ServiceRequestComment>): Promise<ServiceRequestComment> {
    const repo = AppDataSource.getRepository(ServiceRequestComment);
    return repo.save(repo.create(row));
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
    let join = "";

    if (f.scope === "mine") {
      where.push(`(r."requester_id" = $2 OR (r."requested_for_id" = $2 AND r."status" <> 'draft'))`);
    } else if (f.scope === "queue") {
      where.push(`r."status" <> 'draft'`);
    } else {
      join = `JOIN "service_request_approvals" ap ON ap."request_id" = r."id" AND ap."approver_id" = $2`;
      where.push(f.approvalState === "decided" ? `ap."decision" IN ('approved', 'rejected')` : `ap."decision" = 'pending'`);
    }

    if (f.statuses?.length) {
      params.push(f.statuses);
      where.push(`r."status" = ANY($${params.length}::varchar[])`);
    }
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
         ${REQUEST_FROM} ${join}
        WHERE ${where.join(" AND ")}
        ORDER BY r."created_at" DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const total = rows.length ? Number(rows[0].totalCount) : 0;
    return { data: rows, meta: buildMetaFromTotal(f.page, f.limit, total) };
  }

  // Badge numbers for the sidebar and the queue tabs.
  async counts(organizationId: string, userId: string, includeQueue: boolean) {
    const [approvals] = await AppDataSource.query(
      `SELECT COUNT(*)::int AS "n"
         FROM "service_request_approvals" ap
         JOIN "service_requests" r ON r."id" = ap."request_id"
        WHERE r."organization_id" = $1 AND ap."approver_id" = $2
          AND ap."decision" = 'pending' AND r."status" = 'pending_approval'`,
      [organizationId, userId]
    );
    if (!includeQueue) return { pendingApprovals: approvals.n as number, queue: null };
    const [queue] = await AppDataSource.query(
      `SELECT COUNT(*) FILTER (WHERE "status" IN ('submitted', 'approved'))::int AS "ready",
              COUNT(*) FILTER (WHERE "status" IN ('submitted', 'approved') AND "assignee_id" IS NULL)::int AS "unassigned",
              COUNT(*) FILTER (WHERE "status" = 'in_progress' AND "assignee_id" = $2)::int AS "mine",
              COUNT(*) FILTER (WHERE "status" = 'pending_approval')::int AS "awaitingApproval"
         FROM "service_requests" WHERE "organization_id" = $1`,
      [organizationId, userId]
    );
    return { pendingApprovals: approvals.n as number, queue };
  }

  async approvalRows(requestId: string): Promise<ApprovalRow[]> {
    return AppDataSource.query(
      `SELECT ap."id", ap."step_order" AS "stepOrder", ap."approver_id" AS "approverId",
              COALESCE(${name("u")}, u."email") AS "approverName",
              ap."decision", ap."comment", ap."decided_at" AS "decidedAt"
         FROM "service_request_approvals" ap
         JOIN "users" u ON u."id" = ap."approver_id"
        WHERE ap."request_id" = $1
        ORDER BY ap."step_order" ASC, ap."decided_at" ASC NULLS LAST, "approverName" ASC`,
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

  async isApprover(requestId: string, userId: string): Promise<boolean> {
    const rows = await AppDataSource.query(
      `SELECT 1 FROM "service_request_approvals" WHERE "request_id" = $1 AND "approver_id" = $2 LIMIT 1`,
      [requestId, userId]
    );
    return rows.length > 0;
  }
}

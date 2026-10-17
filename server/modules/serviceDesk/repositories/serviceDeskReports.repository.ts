// modules/serviceDesk/repositories/serviceDeskReports.repository.ts
// The figures behind IT-request reporting (story 3: pending requests, overdue
// approvals, fulfilment progress and service-delivery performance). Read-only
// aggregates, organisation first. "In range" means the event — created,
// approved, fulfilled — happened between `from` and `to`.
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export interface ReportRange {
  organizationId: string;
  from: Date;
  to: Date; // exclusive
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const name = (alias: string) => `COALESCE(NULLIF(TRIM(CONCAT(${alias}."first_name", ' ', ${alias}."last_name")), ''), ${alias}."email")`;

export class ServiceDeskReportsRepository {
  static Instance = new ServiceDeskReportsRepository();

  // Right now, regardless of range.
  async snapshot(organizationId: string) {
    const [row] = await AppDataSource.query(
      `SELECT COUNT(*) FILTER (WHERE "status" IN ('submitted', 'pending_approval', 'approved', 'in_progress', 'info_requested'))::int AS "open",
              COUNT(*) FILTER (WHERE "status" = 'pending_approval')::int AS "pendingApproval",
              COUNT(*) FILTER (WHERE "status" = 'pending_approval' AND "approval_due_at" < now())::int AS "overdueApproval",
              COUNT(*) FILTER (WHERE "status" IN ('submitted', 'approved'))::int AS "readyForIt",
              COUNT(*) FILTER (WHERE "status" = 'in_progress')::int AS "inProgress",
              COUNT(*) FILTER (WHERE "status" IN ('submitted', 'approved', 'in_progress') AND "fulfilment_due_at" < now())::int AS "overdueFulfilment",
              COUNT(*) FILTER (WHERE "status" = 'info_requested')::int AS "waitingOnRequester"
         FROM "service_requests" WHERE "organization_id" = $1`,
      [organizationId]
    );
    return row;
  }

  async throughput(r: ReportRange) {
    const [row] = await AppDataSource.query(
      `SELECT COUNT(*) FILTER (WHERE "submitted_at" >= $2 AND "submitted_at" < $3)::int AS "submitted",
              COUNT(*) FILTER (WHERE "fulfilled_at" >= $2 AND "fulfilled_at" < $3)::int AS "fulfilled",
              COUNT(*) FILTER (WHERE "status" = 'rejected' AND "status_updated_at" >= $2 AND "status_updated_at" < $3)::int AS "rejected",
              COUNT(*) FILTER (WHERE "cancelled_at" >= $2 AND "cancelled_at" < $3)::int AS "cancelled",
              AVG(EXTRACT(EPOCH FROM ("approved_at" - "submitted_at")) / 3600)
                FILTER (WHERE "approved_at" >= $2 AND "approved_at" < $3) AS "avgApprovalHours",
              AVG(EXTRACT(EPOCH FROM ("fulfilled_at" - COALESCE("approved_at", "submitted_at"))) / 3600)
                FILTER (WHERE "fulfilled_at" >= $2 AND "fulfilled_at" < $3) AS "avgFulfilmentHours",
              COUNT(*) FILTER (WHERE "fulfilled_at" >= $2 AND "fulfilled_at" < $3 AND "fulfilment_due_at" IS NOT NULL)::int AS "fulfilledWithTarget",
              COUNT(*) FILTER (WHERE "fulfilled_at" >= $2 AND "fulfilled_at" < $3 AND "fulfilled_at" <= "fulfilment_due_at")::int AS "fulfilledOnTime"
         FROM "service_requests" WHERE "organization_id" = $1`,
      [r.organizationId, r.from, r.to]
    );
    return {
      ...row,
      avgApprovalHours: num(row.avgApprovalHours),
      avgFulfilmentHours: num(row.avgFulfilmentHours),
    };
  }

  // How approval steps did: escalations sent in range, by level.
  async escalations(r: ReportRange) {
    const rows: { phase: string; level: number; n: number }[] = await AppDataSource.query(
      `SELECT e."phase", e."level", COUNT(*)::int AS "n"
         FROM "service_request_escalations" e
         JOIN "service_requests" sr ON sr."id" = e."request_id"
        WHERE sr."organization_id" = $1 AND e."created_at" >= $2 AND e."created_at" < $3
        GROUP BY e."phase", e."level"`,
      [r.organizationId, r.from, r.to]
    );
    return rows;
  }

  async byCategory(r: ReportRange) {
    const rows = await AppDataSource.query(
      `SELECT "item_snapshot"->>'categoryName' AS "category",
              COUNT(*) FILTER (WHERE "submitted_at" >= $2 AND "submitted_at" < $3)::int AS "submitted",
              COUNT(*) FILTER (WHERE "fulfilled_at" >= $2 AND "fulfilled_at" < $3)::int AS "fulfilled",
              COUNT(*) FILTER (WHERE "status" IN ('submitted', 'pending_approval', 'approved', 'in_progress', 'info_requested'))::int AS "open",
              AVG(EXTRACT(EPOCH FROM ("fulfilled_at" - COALESCE("approved_at", "submitted_at"))) / 3600)
                FILTER (WHERE "fulfilled_at" >= $2 AND "fulfilled_at" < $3) AS "avgFulfilmentHours",
              COUNT(*) FILTER (WHERE "fulfilled_at" >= $2 AND "fulfilled_at" < $3 AND "fulfilled_at" > "fulfilment_due_at")::int AS "fulfilledLate"
         FROM "service_requests"
        WHERE "organization_id" = $1 AND "status" <> 'draft'
        GROUP BY 1
       HAVING COUNT(*) FILTER (WHERE "submitted_at" >= $2 AND "submitted_at" < $3) > 0
           OR COUNT(*) FILTER (WHERE "status" IN ('submitted', 'pending_approval', 'approved', 'in_progress', 'info_requested')) > 0
        ORDER BY 2 DESC, 1 ASC`,
      [r.organizationId, r.from, r.to]
    );
    return rows.map((x: Record<string, unknown>) => ({ ...x, avgFulfilmentHours: num(x.avgFulfilmentHours) }));
  }

  async byAssignee(r: ReportRange) {
    const rows = await AppDataSource.query(
      `SELECT sr."assignee_id" AS "id", ${name("u")} AS "name",
              COUNT(*) FILTER (WHERE sr."fulfilled_at" >= $2 AND sr."fulfilled_at" < $3)::int AS "fulfilled",
              COUNT(*) FILTER (WHERE sr."status" = 'in_progress')::int AS "inProgress",
              AVG(EXTRACT(EPOCH FROM (sr."fulfilled_at" - COALESCE(sr."started_at", sr."approved_at", sr."submitted_at"))) / 3600)
                FILTER (WHERE sr."fulfilled_at" >= $2 AND sr."fulfilled_at" < $3) AS "avgWorkHours"
         FROM "service_requests" sr
         JOIN "users" u ON u."id" = sr."assignee_id"
        WHERE sr."organization_id" = $1
        GROUP BY sr."assignee_id", u."first_name", u."last_name", u."email"
       HAVING COUNT(*) FILTER (WHERE sr."fulfilled_at" >= $2 AND sr."fulfilled_at" < $3) > 0
           OR COUNT(*) FILTER (WHERE sr."status" = 'in_progress') > 0
        ORDER BY 3 DESC, 2 ASC`,
      [r.organizationId, r.from, r.to]
    );
    return rows.map((x: Record<string, unknown>) => ({ ...x, avgWorkHours: num(x.avgWorkHours) }));
  }

  // The longest-overdue requests, either phase.
  async overdueList(organizationId: string, limit = 20) {
    return AppDataSource.query(
      `SELECT sr."id", sr."request_number" AS "requestNumber", sr."title", sr."status", sr."priority",
              CASE WHEN sr."status" = 'pending_approval' THEN 'approval' ELSE 'fulfilment' END AS "phase",
              CASE WHEN sr."status" = 'pending_approval' THEN sr."approval_due_at" ELSE sr."fulfilment_due_at" END AS "dueAt",
              CASE WHEN sr."status" = 'pending_approval' THEN sr."approval_escalation_level" ELSE sr."fulfilment_escalation_level" END AS "escalationLevel",
              CASE WHEN a."id" IS NOT NULL THEN ${name("a")} END AS "assigneeName"
         FROM "service_requests" sr
         LEFT JOIN "users" a ON a."id" = sr."assignee_id"
        WHERE sr."organization_id" = $1
          AND ((sr."status" = 'pending_approval' AND sr."approval_due_at" < now())
            OR (sr."status" IN ('submitted', 'approved', 'in_progress') AND sr."fulfilment_due_at" < now()))
        ORDER BY 7 ASC
        LIMIT $2`,
      [organizationId, limit]
    );
  }
}

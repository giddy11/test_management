// modules/serviceDesk/repositories/approvalSetup.repository.ts
// The things approvals are built from: approver groups and their members,
// approval policies, out-of-office delegations, and line managers
// (users.manager_id). Every query takes the organisation first.
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { ServiceApproverGroup } from "../entities/serviceApproverGroup.entity";
import { ServiceApprovalPolicy } from "../entities/serviceApprovalPolicy.entity";
import { ServiceApprovalDelegation } from "../entities/serviceApprovalDelegation.entity";
import type { RiskLevel } from "../domain/lifecycle";
import type { PolicyStep } from "../domain/approvalPlan";

const { ActivityLog } = require("../../activity/entities/activityLog.entity");

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  maxRiskLevel: RiskLevel;
  memberIds: string[];
}

export interface DelegationRow {
  userId: string;
  delegateId: string;
  delegateName: string;
  startsOn: string;
  endsOn: string;
  note: string | null;
}

export interface ManagerRow {
  id: string;
  name: string;
  email: string;
  managerId: string | null;
  managerName: string | null;
}

const name = (alias: string) => `COALESCE(NULLIF(TRIM(CONCAT(${alias}."first_name", ' ', ${alias}."last_name")), ''), ${alias}."email")`;

// The pg driver returns DATE columns as Date objects; delegations deal in
// calendar days, so they always travel as YYYY-MM-DD strings.
const DATE_COLUMNS = `to_char(d."starts_on", 'YYYY-MM-DD') AS "startsOn", to_char(d."ends_on", 'YYYY-MM-DD') AS "endsOn"`;

export class ApprovalSetupRepository {
  static Instance = new ApprovalSetupRepository();

  // ── Approver groups ────────────────────────────────────────────────────────
  async listGroups(organizationId: string): Promise<GroupRow[]> {
    return AppDataSource.query(
      `SELECT g."id", g."name", g."description", g."max_risk_level" AS "maxRiskLevel",
              COALESCE(array_agg(m."user_id") FILTER (WHERE m."user_id" IS NOT NULL), '{}') AS "memberIds"
         FROM "service_approver_groups" g
         LEFT JOIN "service_approver_group_members" m ON m."group_id" = g."id"
        WHERE g."organization_id" = $1
        GROUP BY g."id"
        ORDER BY g."name" ASC`,
      [organizationId]
    );
  }

  async findGroup(organizationId: string, id: string): Promise<ServiceApproverGroup | null> {
    return AppDataSource.getRepository(ServiceApproverGroup).findOne({ where: { organizationId, id } });
  }

  async groupNameTaken(organizationId: string, groupName: string, exceptId?: string): Promise<boolean> {
    const rows = await AppDataSource.query(
      `SELECT 1 FROM "service_approver_groups" WHERE "organization_id" = $1 AND LOWER("name") = LOWER($2) AND ($3::uuid IS NULL OR "id" <> $3)`,
      [organizationId, groupName, exceptId ?? null]
    );
    return rows.length > 0;
  }

  // Creates or updates a group and replaces its members, with the audit entry.
  async saveGroup(
    organizationId: string,
    id: string | null,
    fields: { name: string; description: string | null; maxRiskLevel: RiskLevel },
    memberIds: string[] | undefined,
    audit: Record<string, unknown>
  ): Promise<string> {
    return AppDataSource.transaction(async (m: EntityManager) => {
      let groupId = id;
      if (groupId) {
        await m.getRepository(ServiceApproverGroup).update({ organizationId, id: groupId }, fields);
      } else {
        const saved = await m.getRepository(ServiceApproverGroup).save(
          m.getRepository(ServiceApproverGroup).create({ organizationId, ...fields })
        );
        groupId = saved.id;
      }
      if (memberIds) {
        await m.query(`DELETE FROM "service_approver_group_members" WHERE "group_id" = $1`, [groupId]);
        for (const userId of memberIds) {
          await m.query(
            `INSERT INTO "service_approver_group_members" ("group_id", "user_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [groupId, userId]
          );
        }
      }
      await m.insert(ActivityLog, { ...audit, entityId: groupId });
      return groupId as string;
    });
  }

  async deleteGroup(organizationId: string, id: string, audit: Record<string, unknown>): Promise<void> {
    await AppDataSource.transaction(async (m: EntityManager) => {
      await m.getRepository(ServiceApproverGroup).delete({ organizationId, id });
      await m.insert(ActivityLog, audit);
    });
  }

  // ── Policies ───────────────────────────────────────────────────────────────
  async listPolicies(organizationId: string): Promise<(ServiceApprovalPolicy & { itemCount: number })[]> {
    const policies = await AppDataSource.getRepository(ServiceApprovalPolicy).find({
      where: { organizationId },
      order: { name: "ASC" },
    });
    const counts: { policyId: string; n: number }[] = await AppDataSource.query(
      `SELECT "approval_policy_id" AS "policyId", COUNT(*)::int AS "n"
         FROM "service_catalog_items"
        WHERE "organization_id" = $1 AND "approval_policy_id" IS NOT NULL
        GROUP BY "approval_policy_id"`,
      [organizationId]
    );
    const byId = new Map(counts.map((c) => [c.policyId, c.n]));
    return policies.map((p) => ({ ...p, itemCount: byId.get(p.id) ?? 0 }));
  }

  async findPolicy(organizationId: string, id: string): Promise<ServiceApprovalPolicy | null> {
    return AppDataSource.getRepository(ServiceApprovalPolicy).findOne({ where: { organizationId, id } });
  }

  async policyNameTaken(organizationId: string, policyName: string, exceptId?: string): Promise<boolean> {
    const rows = await AppDataSource.query(
      `SELECT 1 FROM "service_approval_policies" WHERE "organization_id" = $1 AND LOWER("name") = LOWER($2) AND ($3::uuid IS NULL OR "id" <> $3)`,
      [organizationId, policyName, exceptId ?? null]
    );
    return rows.length > 0;
  }

  async savePolicy(
    organizationId: string,
    id: string | null,
    fields: { name?: string; description?: string | null; steps?: PolicyStep[] },
    audit: Record<string, unknown>
  ): Promise<ServiceApprovalPolicy> {
    return AppDataSource.transaction(async (m: EntityManager) => {
      const repo = m.getRepository(ServiceApprovalPolicy);
      let saved: ServiceApprovalPolicy;
      if (id) {
        await repo.update({ organizationId, id }, fields as never);
        saved = await repo.findOneOrFail({ where: { organizationId, id } });
      } else {
        saved = await repo.save(repo.create({ organizationId, ...fields }));
      }
      await m.insert(ActivityLog, { ...audit, entityId: saved.id });
      return saved;
    });
  }

  async deletePolicy(organizationId: string, id: string, audit: Record<string, unknown>): Promise<void> {
    await AppDataSource.transaction(async (m: EntityManager) => {
      await m.getRepository(ServiceApprovalPolicy).delete({ organizationId, id });
      await m.insert(ActivityLog, audit);
    });
  }

  // Policies whose steps name this group.
  async policiesUsingGroup(organizationId: string, groupId: string): Promise<string[]> {
    const rows = await AppDataSource.query(
      `SELECT "name" FROM "service_approval_policies"
        WHERE "organization_id" = $1
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("steps") s, jsonb_array_elements(s->'approvers') a
             WHERE a->>'type' = 'group' AND a->>'groupId' = $2
          )`,
      [organizationId, groupId]
    );
    return rows.map((r: { name: string }) => r.name);
  }

  // ── Delegation ─────────────────────────────────────────────────────────────
  async delegationOf(userId: string): Promise<DelegationRow | null> {
    const rows = await AppDataSource.query(
      `SELECT d."user_id" AS "userId", d."delegate_id" AS "delegateId", ${name("u")} AS "delegateName",
              ${DATE_COLUMNS}, d."note"
         FROM "service_approval_delegations" d
         JOIN "users" u ON u."id" = d."delegate_id"
        WHERE d."user_id" = $1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  async saveDelegation(row: Omit<ServiceApprovalDelegation, "createdAt">): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO "service_approval_delegations" ("user_id", "organization_id", "delegate_id", "starts_on", "ends_on", "note")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("user_id") DO UPDATE
         SET "delegate_id" = EXCLUDED."delegate_id", "starts_on" = EXCLUDED."starts_on",
             "ends_on" = EXCLUDED."ends_on", "note" = EXCLUDED."note"`,
      [row.userId, row.organizationId, row.delegateId, row.startsOn, row.endsOn, row.note]
    );
  }

  async deleteDelegation(userId: string): Promise<void> {
    await AppDataSource.query(`DELETE FROM "service_approval_delegations" WHERE "user_id" = $1`, [userId]);
  }

  // Everyone in the organisation away today, and who stands in for them.
  async activeDelegations(organizationId: string): Promise<Map<string, string>> {
    const rows: { userId: string; delegateId: string }[] = await AppDataSource.query(
      `SELECT "user_id" AS "userId", "delegate_id" AS "delegateId"
         FROM "service_approval_delegations"
        WHERE "organization_id" = $1 AND CURRENT_DATE BETWEEN "starts_on" AND "ends_on"`,
      [organizationId]
    );
    return new Map(rows.map((r) => [r.userId, r.delegateId]));
  }

  // ── Line managers ──────────────────────────────────────────────────────────
  async managerOf(organizationId: string, userId: string): Promise<string | null> {
    const rows = await AppDataSource.query(
      `SELECT "manager_id" AS "managerId" FROM "users"
        WHERE "organization_id" = $1 AND "id" = $2 AND "deleted_at" IS NULL`,
      [organizationId, userId]
    );
    return rows[0]?.managerId ?? null;
  }

  async listManagers(organizationId: string): Promise<ManagerRow[]> {
    return AppDataSource.query(
      `SELECT u."id", ${name("u")} AS "name", u."email", u."manager_id" AS "managerId",
              CASE WHEN m."id" IS NOT NULL THEN ${name("m")} END AS "managerName"
         FROM "users" u
         LEFT JOIN "users" m ON m."id" = u."manager_id" AND m."deleted_at" IS NULL
        WHERE u."organization_id" = $1 AND u."deleted_at" IS NULL AND u."client_company_id" IS NULL
        ORDER BY "name" ASC`,
      [organizationId]
    );
  }

  // The chain above `managerId`, for the no-cycles check.
  async chainAbove(organizationId: string, managerId: string): Promise<string[]> {
    const rows: { id: string }[] = await AppDataSource.query(
      `WITH RECURSIVE chain AS (
         SELECT "id", "manager_id", 1 AS depth FROM "users" WHERE "id" = $2 AND "organization_id" = $1
         UNION ALL
         SELECT u."id", u."manager_id", c.depth + 1
           FROM "users" u JOIN chain c ON u."id" = c."manager_id"
          WHERE c.depth < 50
       )
       SELECT "id" FROM chain`,
      [organizationId, managerId]
    );
    return rows.map((r) => r.id);
  }

  async setManager(organizationId: string, userId: string, managerId: string | null, audit: Record<string, unknown>): Promise<void> {
    await AppDataSource.transaction(async (m: EntityManager) => {
      await m.query(
        `UPDATE "users" SET "manager_id" = $3 WHERE "organization_id" = $1 AND "id" = $2 AND "deleted_at" IS NULL`,
        [organizationId, userId, managerId]
      );
      await m.insert(ActivityLog, audit);
    });
  }
}

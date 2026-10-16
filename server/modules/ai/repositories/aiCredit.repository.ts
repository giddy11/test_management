// modules/ai/repositories/aiCredit.repository.ts
// AI credits: balances, the ledger, and per-organisation prices.
//
// applyDelta is the ONLY way a balance changes. It is one guarded UPDATE —
//   balance = balance + delta WHERE balance + delta >= 0 RETURNING balance
// — so concurrent requests can't overspend: if two charges race for the last
// credit, Postgres serialises the row update and the second finds the guard
// false. The ledger row (and, for admin changes, the audit entry) is written in
// the same transaction, so a balance never moves without a record.
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { AiCreditTransaction, type AiCreditTransactionType } from "../entities/aiCreditTransaction.entity";
import { AiSettings } from "../entities/aiSettings.entity";

const { ActivityLog } = require("../../activity/entities/activityLog.entity");
const { getOffset } = require("../../../shared/pagination/paginate");

export interface CreditMove {
  userId: string;
  organizationId: string;
  delta: number;
  type: AiCreditTransactionType;
  feature?: string | null;
  note?: string | null;
  projectId?: string | null;
  detail?: string | null;
  actorId?: string | null;
  usedById?: string | null;
}

export interface CreditHistoryRow {
  id: string;
  type: AiCreditTransactionType;
  amount: number;
  balanceAfter: number;
  feature: string | null;
  note: string | null;
  projectName: string | null;
  usedByName: string | null;
  createdAt: Date;
}

export interface CreditAccountRow {
  userId: string;
  name: string;
  email: string;
  balance: number;
}

// The pg driver, through TypeORM's query(), returns [rows, affectedCount] for
// UPDATE … RETURNING but plain rows for SELECT / INSERT … RETURNING.
export function unwrapRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === "number") {
    return result[0] as T[];
  }
  return Array.isArray(result) ? (result as T[]) : [];
}

const fullName = (alias: string) => `TRIM(CONCAT(${alias}."first_name", ' ', ${alias}."last_name"))`;

export class AiCreditRepository {
  static Instance = new AiCreditRepository();

  // Returns the new balance, or null when the move would take it below zero
  // (nothing is written in that case).
  async applyDelta(move: CreditMove, audit: Record<string, unknown> | null = null): Promise<number | null> {
    return AppDataSource.transaction(async (m: EntityManager) => {
      await m.query(
        `INSERT INTO "ai_credit_accounts" ("user_id", "organization_id") VALUES ($1, $2)
         ON CONFLICT ("user_id") DO NOTHING`,
        [move.userId, move.organizationId]
      );
      const rows = unwrapRows<{ balance: number | string }>(
        await m.query(
          `UPDATE "ai_credit_accounts" SET "balance" = "balance" + $2, "updated_at" = now()
            WHERE "user_id" = $1 AND "balance" + $2 >= 0
            RETURNING "balance"`,
          [move.userId, move.delta]
        )
      );
      if (!rows.length) return null;
      const balance = Number(rows[0].balance);
      await m.insert(AiCreditTransaction, {
        userId: move.userId,
        organizationId: move.organizationId,
        type: move.type,
        amount: move.delta,
        balanceAfter: balance,
        feature: move.feature ?? null,
        note: move.note ?? null,
        projectId: move.projectId ?? null,
        detail: move.detail ? move.detail.slice(0, 300) : null,
        actorId: move.actorId ?? null,
        usedById: move.usedById ?? null,
      });
      if (audit) await m.insert(ActivityLog, audit);
      return balance;
    });
  }

  async balanceOf(userId: string): Promise<number> {
    const rows = await AppDataSource.query(`SELECT "balance" FROM "ai_credit_accounts" WHERE "user_id" = $1`, [userId]);
    return rows.length ? Number(rows[0].balance) : 0;
  }

  // The holder's visible history, newest first.
  async history(userId: string, page: number, limit: number): Promise<{ rows: CreditHistoryRow[]; total: number }> {
    const [rows, count] = await Promise.all([
      AppDataSource.query(
        `SELECT t."id", t."type", t."amount", t."balance_after" AS "balanceAfter", t."feature", t."note",
                p."name" AS "projectName",
                CASE WHEN t."used_by_id" IS NOT NULL AND t."used_by_id" <> t."user_id"
                     THEN ${fullName("u")} END AS "usedByName",
                t."created_at" AS "createdAt"
           FROM "ai_credit_transactions" t
           LEFT JOIN "projects" p ON p."id" = t."project_id"
           LEFT JOIN "users" u ON u."id" = t."used_by_id"
          WHERE t."user_id" = $1 AND t."hidden_at" IS NULL
          ORDER BY t."created_at" DESC
          LIMIT $2 OFFSET $3`,
        [userId, limit, getOffset(page, limit)]
      ),
      AppDataSource.query(
        `SELECT COUNT(*)::int AS n FROM "ai_credit_transactions" WHERE "user_id" = $1 AND "hidden_at" IS NULL`,
        [userId]
      ),
    ]);
    return {
      rows: rows.map((r: CreditHistoryRow) => ({ ...r, amount: Number(r.amount), balanceAfter: Number(r.balanceAfter) })),
      total: Number(count[0]?.n ?? 0),
    };
  }

  // Hides the holder's history from their own view (dryRun only counts). The
  // rows stay in the ledger, and the balance is untouched.
  async hideHistory(userId: string, dryRun: boolean): Promise<number> {
    if (dryRun) {
      const rows = await AppDataSource.query(
        `SELECT COUNT(*)::int AS n FROM "ai_credit_transactions" WHERE "user_id" = $1 AND "hidden_at" IS NULL`,
        [userId]
      );
      return Number(rows[0]?.n ?? 0);
    }
    const result = await AppDataSource.query(
      `UPDATE "ai_credit_transactions" SET "hidden_at" = now()
        WHERE "user_id" = $1 AND "hidden_at" IS NULL
        RETURNING "id"`,
      [userId]
    );
    return unwrapRows(result).length;
  }

  // Product-team members of the organisation with their balance (0 when they
  // have never had credits). External supporters are excluded — they never
  // use AI drafting.
  async listAccounts(
    organizationId: string,
    params: { search?: string; page: number; limit: number }
  ): Promise<{ rows: CreditAccountRow[]; total: number }> {
    const where = [`u."organization_id" = $1`, `u."deleted_at" IS NULL`, `u."client_company_id" IS NULL`];
    const args: unknown[] = [organizationId];
    if (params.search) {
      args.push(`%${params.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where.push(`(${fullName("u")} ILIKE $${args.length} OR u."email" ILIKE $${args.length})`);
    }
    const filter = where.join(" AND ");
    const [rows, count] = await Promise.all([
      AppDataSource.query(
        `SELECT u."id" AS "userId", ${fullName("u")} AS "name", u."email", COALESCE(a."balance", 0) AS "balance"
           FROM "users" u
           LEFT JOIN "ai_credit_accounts" a ON a."user_id" = u."id"
          WHERE ${filter}
          ORDER BY LOWER(u."first_name"), LOWER(u."last_name"), u."id"
          LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
        [...args, params.limit, getOffset(params.page, params.limit)]
      ),
      AppDataSource.query(`SELECT COUNT(*)::int AS n FROM "users" u WHERE ${filter}`, args),
    ]);
    return {
      rows: rows.map((r: CreditAccountRow) => ({ ...r, balance: Number(r.balance) })),
      total: Number(count[0]?.n ?? 0),
    };
  }

  // A product-team member of this organisation (not deleted)?
  async isMemberOf(userId: string, organizationId: string): Promise<boolean> {
    const rows = await AppDataSource.query(
      `SELECT 1 FROM "users"
        WHERE "id" = $1 AND "organization_id" = $2 AND "deleted_at" IS NULL AND "client_company_id" IS NULL`,
      [userId, organizationId]
    );
    return rows.length > 0;
  }

  // ── Prices ──────────────────────────────────────────────────────────────────

  async findPrices(organizationId: string): Promise<Record<string, number>> {
    const row = await AppDataSource.getRepository(AiSettings).findOne({ where: { organizationId } });
    return row?.creditPrices ?? {};
  }

  async savePrices(
    organizationId: string,
    prices: Record<string, number>,
    updatedById: string,
    audit: Record<string, unknown>
  ): Promise<Record<string, number>> {
    await AppDataSource.transaction(async (m: EntityManager) => {
      await m.getRepository(AiSettings).save({ organizationId, creditPrices: prices, updatedById });
      await m.insert(ActivityLog, audit);
    });
    return prices;
  }
}

// modules/ticketLink/repositories/ticketLink.repository.ts
//
// Reads and writes ticket_links, and resolves the tickets on either end of a
// link. The tickets live in three different tables (bugs, feature_requests,
// feedback), so anything that has to look at "a ticket" — showing a link's other
// end, finding similar past tickets — is a UNION over the three, in raw SQL, the
// same way SearchRepository does it.
//
// Every ticket query hides what the product organisation cannot see: soft-deleted
// rows, and a feedback ticket still sitting in a client company's own IT queue
// (see FeedbackService.assertVisibleToOrg). Keeping that here, in the query, means
// a link can never be used to reach a ticket the actor could not open directly.
import type { Repository } from "typeorm";
import { TicketLink } from "../entities/ticketLink.entity";
import type { TicketType, TicketLinkKind } from "../entities/ticketLink.entity";
import { AppDataSource } from "../../../infrastructure/database/dataSource";

export interface TicketKey {
  type: TicketType;
  id: string;
}

// The bits of a ticket the link UI needs, whichever table it came from.
export interface TicketRef {
  type: TicketType;
  id: string;
  projectId: string;
  title: string;
  status: string;
  // The per-type sequence number the reference code is built from
  // (bug_number / request_number / ticket_number).
  number: number;
  // A feedback ticket's own kind (bug / feature_request / complaint) — null for
  // the other two, whose type is the table they live in.
  feedbackType: string | null;
  createdAt: Date;
}

// A ticket returned by a similarity or picker query, with how well it matched.
export interface TicketMatch extends TicketRef {
  score: number;
}

export interface LinkRow extends TicketLink {
  createdByName: string | null;
}

export interface SimilarParams {
  projectId: string;
  title: string;
  exclude: TicketKey | null;
  // A match needs to clear EITHER bar: whole-title similarity, or the typed text
  // being (nearly) contained in a stored title. The second is what lets a
  // half-typed "Sign up but" find "Sign up button not working".
  minSimilarity: number;
  minWordSimilarity: number;
  limit: number;
}

export interface CandidateParams {
  projectId: string;
  term: string;
  exclude: TicketKey | null;
  // Numeric parts of a reference code the caller recognised in the term.
  bugNumber: number | null;
  requestNumber: number | null;
  ticketNumber: number | null;
  limit: number;
}

// Each type contributes at most this many rows before the overall cut, so one
// busy table can't crowd out the other two.
const PER_TYPE_LIMIT = 8;

// A feedback ticket in a client company's IT queue does not exist for the
// product organisation until it is escalated.
const VISIBLE_FEEDBACK = `(fb.client_company_id IS NULL OR fb.support_status = 'escalated')`;

// Projected identically by every branch of the UNIONs below.
const BUG_COLUMNS = `
  'bug'::text AS type, b.id AS id, b.project_id AS project_id, b.title AS title,
  b.status::text AS status, b.bug_number AS number, NULL::text AS feedback_type,
  b.created_at AS created_at`;
const FR_COLUMNS = `
  'feature_request'::text AS type, f.id AS id, f.project_id AS project_id, f.title AS title,
  f.status::text AS status, f.request_number AS number, NULL::text AS feedback_type,
  f.created_at AS created_at`;
const FEEDBACK_COLUMNS = `
  'feedback'::text AS type, fb.id AS id, fb.project_id AS project_id, fb.title AS title,
  fb.status::text AS status, fb.ticket_number AS number, fb.type::text AS feedback_type,
  fb.created_at AS created_at`;

const LINK_SELECT = `
  SELECT l.id, l.project_id, l.source_type, l.source_id, l.target_type, l.target_id,
         l.link_type, l.created_by_id, l.created_at,
         NULLIF(TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))), '') AS created_by_name
  FROM ticket_links l
  LEFT JOIN users u ON u.id = l.created_by_id`;

function toRef(row: any): TicketRef {
  return {
    type: row.type,
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    number: Number(row.number),
    feedbackType: row.feedback_type ?? null,
    createdAt: row.created_at,
  };
}

function toLinkRow(row: any): LinkRow {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    targetType: row.target_type,
    targetId: row.target_id,
    linkType: row.link_type,
    createdById: row.created_by_id ?? null,
    createdAt: row.created_at,
    createdByName: row.created_by_name ?? null,
  };
}

// `%` and `_` are wildcards to ILIKE, so a term containing them would match far
// more than the user typed. Backslash is Postgres's default ILIKE escape.
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export class TicketLinkRepository {
  static Instance = new TicketLinkRepository();

  private repo: Repository<TicketLink>;
  private ds: typeof AppDataSource;

  constructor(ds = AppDataSource) {
    this.ds = ds;
    this.repo = ds.getRepository(TicketLink);
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────

  // The tickets among `keys` that exist and that the product organisation can see.
  // A key that resolves to nothing (deleted, still in an IT queue, wrong id) is
  // simply absent from the result — callers decide whether that is a 404.
  async resolveTickets(keys: TicketKey[]): Promise<TicketRef[]> {
    const ids: Record<TicketType, string[]> = { bug: [], feature_request: [], feedback: [] };
    for (const k of keys) {
      if (!ids[k.type].includes(k.id)) ids[k.type].push(k.id);
    }

    const queries: Promise<any[]>[] = [];
    if (ids.bug.length) {
      queries.push(
        this.ds.query(
          `SELECT ${BUG_COLUMNS} FROM bugs b WHERE b.id = ANY($1::uuid[]) AND b.deleted_at IS NULL`,
          [ids.bug]
        )
      );
    }
    if (ids.feature_request.length) {
      queries.push(
        this.ds.query(
          `SELECT ${FR_COLUMNS} FROM feature_requests f WHERE f.id = ANY($1::uuid[]) AND f.deleted_at IS NULL`,
          [ids.feature_request]
        )
      );
    }
    if (ids.feedback.length) {
      queries.push(
        this.ds.query(
          `SELECT ${FEEDBACK_COLUMNS} FROM feedback fb
           WHERE fb.id = ANY($1::uuid[]) AND fb.deleted_at IS NULL AND ${VISIBLE_FEEDBACK}`,
          [ids.feedback]
        )
      );
    }
    const rows = (await Promise.all(queries)).flat();
    return rows.map(toRef);
  }

  // Past tickets of this project whose title reads like `title`, best match
  // first. Titles only: a ticket's title is what a reporter writes to name the
  // problem, and matching on it keeps the scan to one short column. The scan is
  // bounded by project_id (indexed), so it does not touch other projects' rows.
  async findSimilar(p: SimilarParams): Promise<TicketMatch[]> {
    const params = [
      p.projectId, // $1
      p.title, // $2
      p.exclude?.type ?? null, // $3
      p.exclude?.id ?? null, // $4
      p.minSimilarity, // $5
      p.minWordSimilarity, // $6
      p.limit, // $7
    ];
    // NULL-safe "not the ticket we are comparing against" — `NOT (NULL AND …)`
    // would be NULL and drop every row when nothing is excluded.
    const notExcluded = (type: string, alias: string) =>
      `($3::text IS NULL OR $3::text <> '${type}' OR ${alias}.id <> $4::uuid)`;
    const score = (alias: string) =>
      `GREATEST(similarity(${alias}.title, $2::text), word_similarity($2::text, ${alias}.title))::float8`;
    const matches = (alias: string) =>
      `(similarity(${alias}.title, $2::text) >= $5 OR word_similarity($2::text, ${alias}.title) >= $6)`;

    const sql = `
      SELECT * FROM (
        (
          SELECT ${BUG_COLUMNS}, ${score("b")} AS score
          FROM bugs b
          WHERE b.project_id = $1 AND b.deleted_at IS NULL
            AND ${notExcluded("bug", "b")} AND ${matches("b")}
        )
        UNION ALL
        (
          SELECT ${FR_COLUMNS}, ${score("f")} AS score
          FROM feature_requests f
          WHERE f.project_id = $1 AND f.deleted_at IS NULL
            AND ${notExcluded("feature_request", "f")} AND ${matches("f")}
        )
        UNION ALL
        (
          SELECT ${FEEDBACK_COLUMNS}, ${score("fb")} AS score
          FROM feedback fb
          WHERE fb.project_id = $1 AND fb.deleted_at IS NULL AND ${VISIBLE_FEEDBACK}
            AND ${notExcluded("feedback", "fb")} AND ${matches("fb")}
        )
      ) hits
      ORDER BY score DESC, created_at DESC
      LIMIT $7
    `;
    const rows = await this.ds.query(sql, params);
    return rows.map((r: any) => ({ ...toRef(r), score: Number(r.score) }));
  }

  // The link picker's search: a pasted reference code finds that one ticket, any
  // other text is matched against titles. Within a project.
  async searchCandidates(p: CandidateParams): Promise<TicketMatch[]> {
    const escaped = escapeLike(p.term);
    const params = [
      p.projectId, // $1
      `%${escaped}%`, // $2 — anywhere in the title
      `${escaped}%`, // $3 — at the start, ranked higher
      p.bugNumber, // $4
      p.requestNumber, // $5
      p.ticketNumber, // $6
      p.exclude?.type ?? null, // $7
      p.exclude?.id ?? null, // $8
      PER_TYPE_LIMIT, // $9
      p.limit, // $10
    ];
    const notExcluded = (type: string, alias: string) =>
      `($7::text IS NULL OR $7::text <> '${type}' OR ${alias}.id <> $8::uuid)`;
    // rank 0 = the reference code matched exactly, 1 = title starts with the
    // term, 2 = the term appears somewhere in it. Sorted ascending.
    const rank = (alias: string, titleCol: string, numberCol: string, codeParam: string) => `
      CASE
        WHEN ${codeParam}::int IS NOT NULL AND ${alias}.${numberCol} = ${codeParam}::int THEN 0
        WHEN ${alias}.${titleCol} ILIKE $3 THEN 1
        ELSE 2
      END`;
    const where = (alias: string, numberCol: string, codeParam: string) =>
      `(${alias}.title ILIKE $2 OR (${codeParam}::int IS NOT NULL AND ${alias}.${numberCol} = ${codeParam}::int))`;

    const sql = `
      SELECT * FROM (
        (
          SELECT ${BUG_COLUMNS}, ${rank("b", "title", "bug_number", "$4")}::int AS match_rank
          FROM bugs b
          WHERE b.project_id = $1 AND b.deleted_at IS NULL
            AND ${notExcluded("bug", "b")} AND ${where("b", "bug_number", "$4")}
          ORDER BY match_rank, b.created_at DESC
          LIMIT $9
        )
        UNION ALL
        (
          SELECT ${FR_COLUMNS}, ${rank("f", "title", "request_number", "$5")}::int AS match_rank
          FROM feature_requests f
          WHERE f.project_id = $1 AND f.deleted_at IS NULL
            AND ${notExcluded("feature_request", "f")} AND ${where("f", "request_number", "$5")}
          ORDER BY match_rank, f.created_at DESC
          LIMIT $9
        )
        UNION ALL
        (
          SELECT ${FEEDBACK_COLUMNS}, ${rank("fb", "title", "ticket_number", "$6")}::int AS match_rank
          FROM feedback fb
          WHERE fb.project_id = $1 AND fb.deleted_at IS NULL AND ${VISIBLE_FEEDBACK}
            AND ${notExcluded("feedback", "fb")} AND ${where("fb", "ticket_number", "$6")}
          ORDER BY match_rank, fb.created_at DESC
          LIMIT $9
        )
      ) hits
      ORDER BY match_rank, created_at DESC
      LIMIT $10
    `;
    const rows = await this.ds.query(sql, params);
    // A code match reads as a perfect one; the rest are ordered, not scored.
    return rows.map((r: any) => ({ ...toRef(r), score: r.match_rank === 0 ? 1 : 0 }));
  }

  // ── Links ───────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<LinkRow | null> {
    const rows = await this.ds.query(`${LINK_SELECT} WHERE l.id = $1`, [id]);
    return rows[0] ? toLinkRow(rows[0]) : null;
  }

  // Every link this ticket is on either end of, oldest first.
  async findInvolving(key: TicketKey): Promise<LinkRow[]> {
    const rows = await this.ds.query(
      `${LINK_SELECT}
       WHERE (l.source_type = $1 AND l.source_id = $2)
          OR (l.target_type = $1 AND l.target_id = $2)
       ORDER BY l.created_at ASC`,
      [key.type, key.id]
    );
    return rows.map(toLinkRow);
  }

  // The same for a set of tickets — feeds the badges on a list and the counts
  // beside a suggestion. Scoped to the project so ids from elsewhere never
  // return anything.
  async findInvolvingMany(projectId: string, keys: TicketKey[]): Promise<LinkRow[]> {
    if (keys.length === 0) return [];
    const ids: Record<TicketType, string[]> = { bug: [], feature_request: [], feedback: [] };
    for (const k of keys) ids[k.type].push(k.id);
    const rows = await this.ds.query(
      `${LINK_SELECT}
       WHERE l.project_id = $1
         AND (
           (l.source_type = 'bug' AND l.source_id = ANY($2::uuid[]))
        OR (l.target_type = 'bug' AND l.target_id = ANY($2::uuid[]))
        OR (l.source_type = 'feature_request' AND l.source_id = ANY($3::uuid[]))
        OR (l.target_type = 'feature_request' AND l.target_id = ANY($3::uuid[]))
        OR (l.source_type = 'feedback' AND l.source_id = ANY($4::uuid[]))
        OR (l.target_type = 'feedback' AND l.target_id = ANY($4::uuid[]))
         )`,
      [projectId, ids.bug, ids.feature_request, ids.feedback]
    );
    return rows.map(toLinkRow);
  }

  // The links that mark other tickets as repeats of this one, oldest first.
  async findDuplicatesOf(key: TicketKey): Promise<LinkRow[]> {
    const rows = await this.ds.query(
      `${LINK_SELECT}
       WHERE l.link_type = 'duplicate' AND l.target_type = $1 AND l.target_id = $2
       ORDER BY l.created_at ASC`,
      [key.type, key.id]
    );
    return rows.map(toLinkRow);
  }

  // The link that marks this ticket as a repeat of something, if it is one.
  async findOriginalLink(key: TicketKey): Promise<LinkRow | null> {
    const rows = await this.ds.query(
      `${LINK_SELECT}
       WHERE l.link_type = 'duplicate' AND l.source_type = $1 AND l.source_id = $2
       LIMIT 1`,
      [key.type, key.id]
    );
    return rows[0] ? toLinkRow(rows[0]) : null;
  }

  // Any link between two tickets, in either direction.
  async findBetween(a: TicketKey, b: TicketKey): Promise<LinkRow | null> {
    const rows = await this.ds.query(
      `${LINK_SELECT}
       WHERE (l.source_type = $1 AND l.source_id = $2 AND l.target_type = $3 AND l.target_id = $4)
          OR (l.source_type = $3 AND l.source_id = $4 AND l.target_type = $1 AND l.target_id = $2)
       LIMIT 1`,
      [a.type, a.id, b.type, b.id]
    );
    return rows[0] ? toLinkRow(rows[0]) : null;
  }

  async create(data: {
    projectId: string;
    sourceType: TicketType;
    sourceId: string;
    targetType: TicketType;
    targetId: string;
    linkType: TicketLinkKind;
    createdById: string | null;
  }): Promise<TicketLink> {
    return this.repo.save(this.repo.create(data));
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}

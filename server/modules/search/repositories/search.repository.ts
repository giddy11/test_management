// modules/search/repositories/search.repository.ts
//
// The one query behind Global Search.
//
// Everything searchable hangs off a project, so the whole thing is anchored to
// a single `accessible` CTE: the projects this actor may see. Every branch of
// the UNION joins it, which is what makes "you cannot find what you cannot
// open" a property of the query rather than a rule each branch remembers to
// apply. The CTE's membership clause is deliberately identical to
// ProjectRepository.fetchPaginated's `restrictedUserId` clause — the two must
// not drift, or search and the project list would disagree about what exists.
import { AppDataSource } from "../../../infrastructure/database/dataSource";

// Each type contributes at most this many rows before the overall cut, so one
// noisy type (test cases, usually) can't crowd out every other type.
const PER_TYPE_LIMIT = 8;

export type SearchResultType = "project" | "suite" | "case" | "run" | "bug" | "ticket";

export interface SearchRow {
  type: SearchResultType;
  id: string;
  title: string;
  reference: string | null;
  number: number | null;
  project_id: string;
  project_name: string;
  suite_id: string | null;
  context: string | null;
  created_at: Date;
  rank: number;
}

export interface SearchParams {
  organizationId: string;
  // The user id to restrict to, or null for an actor with org-wide project read.
  restrictedUserId: string | null;
  term: string;
  limit: number;
  // Numeric parts of a reference code the caller recognised ("BF-…", "TKT-…").
  bugNumber: number | null;
  ticketNumber: number | null;
}

// `%` and `_` are wildcards to ILIKE, so a term containing them would match far
// more than the user typed. Backslash is Postgres's default ILIKE escape.
function escapeLike(term: string): string {
  return term.replace(/[\%_]/g, (ch) => `\${ch}`);
}

// Projects the actor may see. Membership, a test case assignment in the
// project, or org-wide read ($2 IS NULL) — nothing else.
const ACCESSIBLE_PROJECTS = `
  SELECT p.id, p.name, p.created_at
  FROM projects p
  WHERE p.deleted_at IS NULL
    AND p.organization_id = $1
    AND (
      $2::uuid IS NULL
      OR EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = $2
      )
      OR EXISTS (
        SELECT 1 FROM test_suites ts
        JOIN test_cases tc ON tc.suite_id = ts.id AND tc.deleted_at IS NULL
        JOIN test_case_assignees tca ON tca.test_case_id = tc.id
        WHERE ts.project_id = p.id AND ts.deleted_at IS NULL AND tca.user_id = $2
      )
    )
`;

// rank 0 = matched a reference code exactly, 1 = the term starts the title,
// 2 = the term appears somewhere in it. Sorted ascending, so the most literal
// match a user could have meant comes first.
export class SearchRepository {
  static Instance = new SearchRepository();

  ds: typeof AppDataSource;

  constructor(ds = AppDataSource) {
    this.ds = ds;
  }

  async search({
    organizationId,
    restrictedUserId,
    term,
    limit,
    bugNumber,
    ticketNumber,
  }: SearchParams): Promise<SearchRow[]> {
    const escaped = escapeLike(term);
    const params = [
      organizationId, // $1
      restrictedUserId, // $2
      `%${escaped}%`, // $3 — anywhere in the text
      `${escaped}%`, // $4 — at the start, ranked higher
      bugNumber, // $5
      ticketNumber, // $6
      PER_TYPE_LIMIT, // $7
      limit, // $8
    ];

    // Each branch is ordered by its 11th output column — `rank` — by ordinal:
    // inside a parenthesised UNION branch the output aliases of the first branch
    // are not in scope, so the position is the only way to name it.
    const sql = `
      WITH accessible AS (${ACCESSIBLE_PROJECTS})
      SELECT * FROM (
        (
          SELECT 'project'::text AS type, a.id::uuid AS id, a.name::text AS title,
                 NULL::text AS reference, NULL::int AS number,
                 a.id::uuid AS project_id, a.name::text AS project_name,
                 NULL::uuid AS suite_id, NULL::text AS context,
                 a.created_at AS created_at,
                 (CASE WHEN a.name ILIKE $4 THEN 1 ELSE 2 END)::int AS rank
          FROM accessible a
          WHERE a.name ILIKE $3
          ORDER BY 11, a.created_at DESC
          LIMIT $7
        )
        UNION ALL
        (
          SELECT 'suite', ts.id, ts.name, NULL, NULL,
                 a.id, a.name, ts.id, NULL, ts.created_at,
                 CASE WHEN ts.name ILIKE $4 THEN 1 ELSE 2 END
          FROM test_suites ts
          JOIN accessible a ON a.id = ts.project_id
          WHERE ts.deleted_at IS NULL AND ts.name ILIKE $3
          ORDER BY 11, ts.created_at DESC
          LIMIT $7
        )
        UNION ALL
        (
          SELECT 'case', tc.id, tc.title, tc.external_id, NULL,
                 a.id, a.name, tc.suite_id, ts.name, tc.created_at,
                 CASE WHEN tc.title ILIKE $4 THEN 1 ELSE 2 END
          FROM test_cases tc
          JOIN test_suites ts ON ts.id = tc.suite_id AND ts.deleted_at IS NULL
          JOIN accessible a ON a.id = ts.project_id
          WHERE tc.deleted_at IS NULL AND (tc.title ILIKE $3 OR tc.external_id ILIKE $3)
          ORDER BY 11, tc.created_at DESC
          LIMIT $7
        )
        UNION ALL
        (
          SELECT 'run', r.id, r.name, NULL, NULL,
                 a.id, a.name, r.suite_id, ts.name, r.created_at,
                 CASE WHEN r.name ILIKE $4 THEN 1 ELSE 2 END
          FROM test_runs r
          JOIN accessible a ON a.id = r.project_id
          LEFT JOIN test_suites ts ON ts.id = r.suite_id AND ts.deleted_at IS NULL
          WHERE r.name ILIKE $3
          ORDER BY 11, r.created_at DESC
          LIMIT $7
        )
        UNION ALL
        (
          SELECT 'bug', b.id, b.title, NULL, b.bug_number,
                 a.id, a.name, NULL, b.status::text, b.created_at,
                 CASE
                   WHEN $5::int IS NOT NULL AND b.bug_number = $5 THEN 0
                   WHEN b.title ILIKE $4 THEN 1
                   ELSE 2
                 END
          FROM bugs b
          JOIN accessible a ON a.id = b.project_id
          WHERE b.deleted_at IS NULL
            AND (b.title ILIKE $3 OR ($5::int IS NOT NULL AND b.bug_number = $5))
          ORDER BY 11, b.created_at DESC
          LIMIT $7
        )
        UNION ALL
        (
          SELECT 'ticket', fb.id, fb.title, NULL, fb.ticket_number,
                 a.id, a.name, NULL, fb.type::text, fb.created_at,
                 CASE
                   WHEN $6::int IS NOT NULL AND fb.ticket_number = $6 THEN 0
                   WHEN fb.title ILIKE $4 THEN 1
                   ELSE 2
                 END
          FROM feedback fb
          JOIN accessible a ON a.id = fb.project_id
          WHERE fb.deleted_at IS NULL
            -- An item still sitting in a client company's own IT queue does not
            -- exist for the product organisation (FeedbackService.assertVisibleToOrg),
            -- and must not surface here either.
            AND (fb.client_company_id IS NULL OR fb.support_status = 'escalated')
            AND (fb.title ILIKE $3 OR ($6::int IS NOT NULL AND fb.ticket_number = $6))
          ORDER BY 11, fb.created_at DESC
          LIMIT $7
        )
      ) hits
      ORDER BY rank, created_at DESC
      LIMIT $8
    `;

    return this.ds.query(sql, params);
  }
}

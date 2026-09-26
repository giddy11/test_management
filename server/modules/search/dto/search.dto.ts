// modules/search/dto/search.dto.ts
import type { SearchRow, SearchResultType } from "../repositories/search.repository";

const { formatReferenceCode } = require("../../../shared/utils/referenceCode");

export interface SearchResultResponse {
  type: SearchResultType;
  id: string;
  title: string;
  // The human-readable identifier for the record, where it has one: a bug's
  // "BF-…", a ticket's "TKT-…", a test case's imported external id. Null for
  // the types that are only ever identified by name.
  reference: string | null;
  projectId: string;
  projectName: string;
  // Test cases and runs live under a suite; the client needs it to build the URL.
  suiteId: string | null;
  // One extra line to tell two similarly-named records apart — the suite a case
  // belongs to, a bug's status, a ticket's type.
  context: string | null;
  createdAt: Date;
}

// The prefix each numbered type's reference code is built from — the same
// prefixes bug.dto and feedback.dto use, so a code copied out of search pastes
// back into the list filters that accept one.
const CODE_PREFIX: Partial<Record<SearchResultType, string>> = {
  bug: "BF",
  ticket: "TKT",
};

function referenceFor(row: SearchRow): string | null {
  const prefix = CODE_PREFIX[row.type];
  if (prefix && row.number != null) {
    return formatReferenceCode(prefix, row.number, row.created_at);
  }
  return row.reference ?? null;
}

export function toSearchResultResponse(row: SearchRow): SearchResultResponse {
  return {
    type: row.type,
    id: row.id,
    title: row.title,
    reference: referenceFor(row),
    projectId: row.project_id,
    projectName: row.project_name,
    suiteId: row.suite_id ?? null,
    context: row.context ?? null,
    createdAt: row.created_at,
  };
}

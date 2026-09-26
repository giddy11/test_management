// types/search.types.ts — mirrors the backend SearchResultResponse.

export type SearchResultType = "project" | "suite" | "case" | "run" | "bug" | "ticket"

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  // A bug's "BF-…", a ticket's "TKT-…", a case's imported external id, or null
  // for the types identified only by name.
  reference: string | null
  projectId: string
  projectName: string
  suiteId: string | null
  // One extra line to tell similarly-named records apart.
  context: string | null
  createdAt: string
}

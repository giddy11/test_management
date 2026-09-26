// endpoints/search.endpoints.ts
import { wrapCall } from "@/transport/http"
import type { SearchResult } from "@/types/search.types"

export const SearchEndpoints = {
  search: (q: string, limit?: number) =>
    wrapCall<SearchResult[]>("GET", "/api/v1/search", { q, limit }),
}

// cypress/support/api.ts — helpers for building ApiResponse envelopes and
// matching API URLs. Mirrors src/types/api.types.ts so stubs look exactly
// like what the transport layer expects.

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface ApiEnvelope<T = unknown> {
  success: boolean
  message: string
  statusCode: number
  data: T | null
  errors: { field: string; message: string }[]
  meta?: PaginationMeta
}

// Successful envelope, mirroring the backend's ApiResponse shape.
export function ok<T>(data: T, meta?: PaginationMeta): ApiEnvelope<T> {
  return {
    success: true,
    message: "OK",
    statusCode: 200,
    data,
    errors: [],
    ...(meta ? { meta } : {}),
  }
}

// Failure envelope — pair with an HTTP statusCode on the intercept so the
// transport layer's normaliseError() throws an ApiError with this message.
export function fail(message: string, statusCode = 400): ApiEnvelope<null> {
  return { success: false, message, statusCode, data: null, errors: [] }
}

// Pagination meta for stubbed list endpoints.
export function listMeta(total: number, page = 1, limit = 20): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 }
}

// Anchored matcher for an /api/v1 path: matches the exact path with an
// optional query string, so "/notifications" never swallows
// "/notifications/unread-count".
export function apiPath(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`/api/v1${escaped}(\\?.*)?$`)
}

// Keys the app persists tokens under (see src/lib/storage.ts).
export const ACCESS_TOKEN_KEY = "tm_access_token"
export const REFRESH_TOKEN_KEY = "tm_refresh_token"

// types/api.types.ts — mirrors the backend ApiResponse envelope.

export interface ValidationError {
  field: string
  message: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
  nextCursor?: string
}

export interface ApiResponse<T = null> {
  success: boolean
  message: string
  statusCode: number
  data: T | null
  errors: ValidationError[]
  meta?: PaginationMeta
}

// transport/http.ts — single HTTP client. All config lives here.
import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios"
import type { ApiResponse, ValidationError } from "@/types/api.types"
import { tokenStorage } from "@/lib/storage"

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000"

// Error thrown by wrapCall — carries the parsed ApiResponse fields.
export class ApiError extends Error {
  statusCode: number
  errors: ValidationError[]
  constructor(message: string, statusCode = 0, errors: ValidationError[] = []) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.errors = errors
  }
}

const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
})

// Attach the access token on every request.
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Refresh handling — a single in-flight refresh shared by concurrent 401s.
let refreshing: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefresh()
  if (!refreshToken) return false
  try {
    const res = await axios.post<ApiResponse<{ tokens: { accessToken: string; refreshToken: string } }>>(
      `${BASE_URL}/api/v1/auth/refresh`,
      { refreshToken },
      { headers: { "Content-Type": "application/json" } }
    )
    const tokens = res.data.data?.tokens
    if (tokens) {
      tokenStorage.set(tokens.accessToken, tokens.refreshToken)
      return true
    }
    return false
  } catch {
    return false
  }
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    const isAuthRoute = original?.url?.includes("/auth/")

    if (error.response?.status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true
      refreshing = refreshing ?? refreshTokens()
      const ok = await refreshing
      refreshing = null
      if (ok) {
        const token = tokenStorage.getAccess()
        if (token) original.headers.Authorization = `Bearer ${token}`
        return http.request(original)
      }
      tokenStorage.clear()
    }
    return Promise.reject(error)
  }
)

function normaliseError(err: unknown): never {
  if (err instanceof AxiosError && err.response?.data) {
    const body = err.response.data as ApiResponse
    throw new ApiError(body.message ?? "Request failed", body.statusCode, body.errors ?? [])
  }
  throw new ApiError(
    err instanceof Error ? err.message : "Network error — please try again",
    0
  )
}

export async function wrapCall<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  payload?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  try {
    const config = method === "GET" ? { params: payload } : { data: payload }
    const response = await http.request<ApiResponse<T>>({ method, url: path, ...config })
    return response.data
  } catch (err) {
    return normaliseError(err)
  }
}

// Multipart upload (attachments). Files are appended under `field`.
export async function uploadCall<T>(
  path: string,
  files: File[],
  field = "images"
): Promise<ApiResponse<T>> {
  const form = new FormData()
  files.forEach((f) => form.append(field, f))
  try {
    const response = await http.post<ApiResponse<T>>(path, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return response.data
  } catch (err) {
    return normaliseError(err)
  }
}

// Multiple files + extra text fields (e.g. the public feedback form).
export async function uploadFilesWithFields<T>(
  path: string,
  files: File[],
  fields: Record<string, string> = {},
  fileField = "images"
): Promise<ApiResponse<T>> {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  files.forEach((f) => form.append(fileField, f))
  try {
    const response = await http.post<ApiResponse<T>>(path, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return response.data
  } catch (err) {
    return normaliseError(err)
  }
}

// Single file + extra text fields (e.g. import: file + suiteId).
export async function uploadWithFields<T>(
  path: string,
  file: File,
  fields: Record<string, string> = {},
  fileField = "file"
): Promise<ApiResponse<T>> {
  const form = new FormData()
  form.append(fileField, file)
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  try {
    const response = await http.post<ApiResponse<T>>(path, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return response.data
  } catch (err) {
    return normaliseError(err)
  }
}

// Downloads a binary response (e.g. the XLSX template) and triggers a save dialog.
export async function downloadFile(path: string, filename: string): Promise<void> {
  try {
    const response = await http.get(path, { responseType: "blob" })
    const url = URL.createObjectURL(response.data as Blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch {
    throw new ApiError("Download failed — please try again", 0)
  }
}

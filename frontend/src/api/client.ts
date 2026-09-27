import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

import { notifyUnauthorized, readSession } from '@/api/session'
import type { ProblemDetails } from '@/types/api'

/*
  `/api` is a relative base URL, so requests go to whatever origin served the app. In dev
  Vite proxies /api to http://localhost:5086; in the container nginx proxies it to the
  backend service (02 §4). The client never learns the API's real address, which is why
  there is no CORS policy to configure on either side.
*/
export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor — one place that knows about the Authorization header.
api.interceptors.request.use((config) => {
  const session = readSession()
  if (session) {
    config.headers.Authorization = `Bearer ${session.token}`
  }
  return config
})

/** A failed request, flattened to the one thing the UI actually renders: a sentence. */
export class ApiError extends Error {
  readonly status: number
  /** Per-field messages from ASP.NET Core's model-validation ProblemDetails, if any. */
  readonly fieldErrors: Record<string, string[]>

  constructor(message: string, status: number, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

function describe(error: AxiosError<ProblemDetails>): ApiError {
  if (!error.response) {
    return new ApiError(
      'Could not reach the ledger API. Is the backend running?',
      0,
    )
  }

  const { status, data } = error.response

  // Model-validation failures arrive as { errors: { Field: [...] } }; domain failures
  // arrive as a ProblemDetails whose `title` is the message the service threw (08 §4).
  const fieldErrors = data?.errors ?? {}
  const firstFieldError = Object.values(fieldErrors).flat()[0]
  const message =
    data?.title ?? data?.detail ?? firstFieldError ?? `Request failed with status ${status}.`

  return new ApiError(message, status, fieldErrors)
}

// Response interceptor — a 401 means the token is gone or expired, so tear the session
// down once, centrally, instead of letting every page invent its own recovery.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ProblemDetails>) => {
    if (error.response?.status === 401) {
      notifyUnauthorized()
    }
    return Promise.reject(describe(error))
  },
)

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.get<T>(url, config)
  return data
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.post<T>(url, body)
  return data
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.put<T>(url, body)
  return data
}

/**
 * `"2026-09-01"` → `"2026-09-01T00:00:00Z"` for query-string date filters.
 *
 * Needed because the backend compares against a `timestamp with time zone` column, and
 * Npgsql refuses a `DateTime` whose `Kind` is `Unspecified` — which is exactly what a bare
 * `?from=2026-09-01` binds to. Appending the zone designator makes the bound value
 * zone-aware, so the filter reaches the database instead of throwing (08 §4, 09 §4).
 */
export function asUtcInstant(dateInput: string | undefined): string | undefined {
  return dateInput ? `${dateInput}T00:00:00Z` : undefined
}

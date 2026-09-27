import { get } from '@/api/client'
import type { DashboardSummary, TrialBalanceReport } from '@/types/api'

/**
 * `asOf` is safe to send as a bare `YYYY-MM-DD` — unlike the journal filters, the report
 * service re-stamps it as UTC midnight server-side before it reaches the query (09 §4).
 */
export function getTrialBalance(asOf?: string) {
  return get<TrialBalanceReport>('/reports/trial-balance', {
    params: asOf ? { asOf } : undefined,
  })
}

export function getDashboardSummary(recent = 6) {
  return get<DashboardSummary>('/dashboard/summary', { params: { recent } })
}

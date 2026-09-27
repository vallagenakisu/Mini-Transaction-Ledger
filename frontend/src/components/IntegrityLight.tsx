import { CheckIcon, TriangleAlertIcon } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { getDashboardSummary } from '@/api/reports'
import { Money } from '@/components/Money'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import { useLedgerRevision } from '@/hooks/useLedgerRevision'
import { cn } from '@/lib/utils'

/**
 * The always-visible health light: total debits against total credits across the entire
 * ledger, and whether they match.
 *
 * Why put it in the chrome rather than only on the trial balance page? Because it is the one
 * fact about this system that is always worth knowing, and because a checksum that is only
 * checked when you go looking for it is not much of a checksum. It re-reads on every
 * navigation, and again whenever anything is posted — one small aggregate query (09 §8.7),
 * which is the price of the light being live rather than a decoration.
 */
export function IntegrityLight() {
  const location = useLocation()
  const revision = useLedgerRevision()
  const { data, loading } = useApi(() => getDashboardSummary(1), [location.pathname, revision])

  if (loading && !data) {
    return (
      <div className="space-y-2 px-1 py-1">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-3.5 w-full" />
      </div>
    )
  }

  if (!data) return null

  const balanced = data.isBalanced

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2.5',
        balanced ? 'border-balanced/35 bg-balanced-wash/50' : 'border-danger/40 bg-danger-wash',
      )}
    >
      <p className="eyebrow mb-1.5 flex items-center gap-1.5">
        {balanced ? (
          <CheckIcon className={cn('size-3', 'text-balanced')} strokeWidth={3} />
        ) : (
          <TriangleAlertIcon className="size-3 text-danger" strokeWidth={2.5} />
        )}
        <span className={balanced ? 'text-balanced' : 'text-danger'}>
          {balanced ? 'Ledger balances' : 'Out of balance'}
        </span>
      </p>
      <dl className="space-y-0.5 text-[0.75rem]">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted">Dr</dt>
          <dd>
            <Money value={data.totalDebits} className="text-[0.75rem] text-debit" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted">Cr</dt>
          <dd>
            <Money value={data.totalCredits} className="text-[0.75rem] text-credit" />
          </dd>
        </div>
      </dl>
      <p className="num mt-2 border-t border-current/15 pt-1.5 text-[0.6875rem] text-faint">
        {data.transactionCount} transactions · {data.accountCount} accounts
      </p>
    </div>
  )
}

import { ArrowRightIcon, EqualIcon, ScaleIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { getDashboardSummary } from '@/api/reports'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { RecentJournal } from '@/components/RecentJournal'
import { ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/useApi'
import { formatDate } from '@/lib/format'
import { ACCOUNT_TYPES, accountTypeOrder } from '@/lib/ledger'
import { cn } from '@/lib/utils'
import type { AccountTypeTotal } from '@/types/api'

/*
  The whole-ledger view.

  This used to be the landing page, and it also carried a transfer form. Both were wrong:
  posting starts from an account (that is what /), and a page whose job is to *report* the
  ledger's position should not also be a place you change it. So this page is read-only —
  the position, the checksum, and what was posted recently.
*/
export default function Overview() {
  const summary = useApi(() => getDashboardSummary(8), [])

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={summary.data ? `As of ${formatDate(summary.data.asOf)}` : 'Overview'}
        title="Where the ledger stands"
        actions={
          <Button variant="outline" asChild>
            <Link to="/reports/trial-balance">
              <ScaleIcon /> Trial balance
            </Link>
          </Button>
        }
      />

      {summary.error ? (
        <Panel>
          <ErrorState error={summary.error} onRetry={summary.reload} />
        </Panel>
      ) : (
        <>
          {/* The checksum, stated plainly: two sums that must agree, and the verdict. */}
          <div className="grid gap-px overflow-hidden rounded-panel border border-rule bg-rule sm:grid-cols-4">
            <Figure label="Accounts" value={summary.data?.accountCount} plain />
            <Figure label="Transactions" value={summary.data?.transactionCount} plain />
            <Figure label="Total debits" value={summary.data?.totalDebits} tone="debit" />
            <Figure label="Total credits" value={summary.data?.totalCredits} tone="credit" />
          </div>

          <Equation totals={summary.data?.totalsByType} loading={summary.loading} />

          <Panel>
            <PanelHeader
              eyebrow="Journal"
              title="Recently posted"
              meta={
                summary.data
                  ? `${summary.data.transactionCount} transaction${
                      summary.data.transactionCount === 1 ? '' : 's'
                    } in the ledger`
                  : undefined
              }
              actions={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/transactions">
                    Full journal <ArrowRightIcon />
                  </Link>
                </Button>
              }
            />
            {summary.loading && !summary.data ? (
              <SkeletonRows rows={5} cols={5} />
            ) : (
              <RecentJournal transactions={summary.data?.recentTransactions ?? []} />
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

function Figure({
  label,
  value,
  tone,
  plain = false,
}: {
  label: string
  value: number | undefined
  tone?: 'debit' | 'credit'
  plain?: boolean
}) {
  return (
    <div className="bg-card px-5 py-4">
      <p className={cn('eyebrow mb-2', tone === 'debit' && 'text-debit', tone === 'credit' && 'text-credit')}>
        {label}
      </p>
      {value === undefined ? (
        <span className="num text-xl text-faint">—</span>
      ) : plain ? (
        <span className="num text-xl font-medium text-ink">{value}</span>
      ) : (
        <Money value={value} className="text-xl" emphasis="strong" />
      )}
    </div>
  )
}

/**
 * The headline is the accounting equation itself, not a row of stat tiles.
 *
 * Debit-normal types on the left, credit-normal on the right; the two totals are equal
 * because every transaction put the same amount on both sides. It is the trial balance's
 * checksum restated in five rows — and unlike "total transactions: 5", it is a number whose
 * meaning you can defend.
 *
 * Every figure here is a *normalised* balance: the server already flipped the sign for the
 * credit-normal types (01 §5.1), which is why Owner's Capital reads positive.
 */
function Equation({
  totals,
  loading,
}: {
  totals: AccountTypeTotal[] | undefined
  loading: boolean
}) {
  if (loading && !totals) {
    return (
      <Panel>
        <PanelHeader eyebrow="Position" title="The accounting equation" />
        <PanelBody className="space-y-4">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </PanelBody>
      </Panel>
    )
  }

  const rows = [...(totals ?? [])].sort(
    (a, b) => accountTypeOrder(a.type) - accountTypeOrder(b.type),
  )
  const sideOf = (type: AccountTypeTotal['type']) =>
    ACCOUNT_TYPES.find((meta) => meta.type === type)?.side ?? 'left'

  const left = rows.filter((row) => sideOf(row.type) === 'left')
  const right = rows.filter((row) => sideOf(row.type) === 'right')
  const leftTotal = left.reduce((sum, row) => sum + row.total, 0)
  const rightTotal = right.reduce((sum, row) => sum + row.total, 0)
  const holds = leftTotal === rightTotal
  const scale = Math.max(...rows.map((row) => row.total), 1)

  return (
    <Panel>
      <PanelHeader
        eyebrow="Position"
        title="The accounting equation"
        actions={
          <Badge tone={holds ? 'balanced' : 'danger'}>{holds ? 'Holds' : 'Broken'}</Badge>
        }
      />
      <PanelBody className="grid gap-x-8 gap-y-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <Side rows={left} total={leftTotal} scale={scale} tone="debit" caption="Debit-normal" />

        <div className="flex items-center justify-center md:flex-col md:gap-2">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full border',
              holds
                ? 'border-balanced/40 bg-balanced-wash text-balanced'
                : 'border-danger/40 bg-danger-wash text-danger',
            )}
          >
            <EqualIcon className="size-4" strokeWidth={2.5} />
          </span>
        </div>

        <Side rows={right} total={rightTotal} scale={scale} tone="credit" caption="Credit-normal" />
      </PanelBody>
    </Panel>
  )
}

function Side({
  rows,
  total,
  scale,
  tone,
  caption,
}: {
  rows: AccountTypeTotal[]
  total: number
  scale: number
  tone: 'debit' | 'credit'
  caption: string
}) {
  return (
    <div>
      <p className="eyebrow mb-3">{caption}</p>
      <dl className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.type}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[0.875rem] text-ink">
                {row.type}
                <span className="num ml-2 text-[0.6875rem] text-faint">{row.accountCount}</span>
              </dt>
              <dd>
                <Money value={row.total} className="text-[0.875rem]" />
              </dd>
            </div>
            {/* A plain proportional rule rather than a chart: it is a comparison of five
                numbers, and five numbers do not need an axis. */}
            <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-sunk">
              <div
                className={cn('h-full rounded-full', tone === 'debit' ? 'bg-debit' : 'bg-credit')}
                style={{ width: `${Math.max((row.total / scale) * 100, row.total > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
        ))}
      </dl>
      <div className="total-rule mt-4 flex items-baseline justify-between gap-3 py-2">
        <span className="eyebrow">Total</span>
        <Money value={total} emphasis="strong" className="text-[0.9375rem]" />
      </div>
    </div>
  )
}

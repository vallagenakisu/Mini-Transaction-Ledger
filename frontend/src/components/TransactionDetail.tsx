import { ArrowUpRightIcon, UndoDotIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { getTransaction } from '@/api/transactions'
import { useAuth } from '@/auth/useAuth'
import { Money } from '@/components/Money'
import { ReverseDialog } from '@/components/ReverseDialog'
import { Reference, TransactionMarks } from '@/components/TransactionMarks'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table, TotalRow } from '@/components/ui/table'
import { useApi } from '@/hooks/useApi'
import { formatDate, formatTimestamp } from '@/lib/format'

/**
 * One transaction, opened out into its journal lines.
 *
 * This is the view that makes the model visible: a header with a reference and a date, and
 * two or more lines whose debit and credit columns come to the same figure. The entries are
 * fetched on expand rather than shipped with the list — the list endpoint deliberately
 * returns a slim projection so that paging the journal is one query, not one per row (07 §6).
 */
export function TransactionDetail({
  transactionId,
  onReversed,
}: {
  transactionId: number
  onReversed: (reversalId: number) => void
}) {
  const { isAdmin } = useAuth()
  const [reversing, setReversing] = useState(false)

  const detail = useApi(() => getTransaction(transactionId), [transactionId])

  if (detail.error) {
    return (
      <div className="px-3 py-4">
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </div>
    )
  }

  if (!detail.data) {
    return (
      <div className="space-y-2 px-3 py-5">
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    )
  }

  const transaction = detail.data
  const debits = transaction.entries.filter((entry) => entry.direction === 'Debit')
  const credits = transaction.entries.filter((entry) => entry.direction === 'Credit')
  const debitTotal = debits.reduce((sum, entry) => sum + entry.amount, 0)
  const creditTotal = credits.reduce((sum, entry) => sum + entry.amount, 0)

  return (
    <div className="border-l-2 border-rule-strong bg-sunk/60 px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <dl className="grid gap-x-8 gap-y-2 text-[0.8125rem] sm:grid-cols-2">
          <Detail label="Reference">
            <Reference value={transaction.reference} reversed={transaction.isReversed} />
          </Detail>
          <Detail label="Transaction date">{formatDate(transaction.transactionDate)}</Detail>
          <Detail label="Posted">{formatTimestamp(transaction.postedAt)}</Detail>
          <Detail label="Posted by">{transaction.createdBy}</Detail>
          {transaction.reversalOfTransactionId ? (
            <Detail label="Reverses">
              <LinkedTransaction id={transaction.reversalOfTransactionId} />
            </Detail>
          ) : null}
          {transaction.reversedByTransactionId ? (
            <Detail label="Reversed by">
              <LinkedTransaction id={transaction.reversedByTransactionId} />
            </Detail>
          ) : null}
        </dl>

        <div className="flex items-center gap-2">
          <TransactionMarks transaction={transaction} />
          {/* R14: reversal is Admin-only, and R12 allows at most one. Both conditions are
              re-checked server-side under a row lock — the button is a courtesy. */}
          {isAdmin && !transaction.isReversed ? (
            <Button variant="outline" size="sm" onClick={() => setReversing(true)}>
              <UndoDotIcon /> Reverse
            </Button>
          ) : null}
        </div>
      </div>

      <Table className="max-w-3xl">
        <THead>
          <tr>
            <TH className="pl-0">Account</TH>
            <TH align="right" className="w-32">
              Debit
            </TH>
            <TH align="right" className="w-32 pr-0">
              Credit
            </TH>
          </tr>
        </THead>
        <TBody>
          {transaction.entries.map((entry) => (
            <TR key={entry.id}>
              <TD className="pl-0">
                <Link
                  to={`/accounts/${entry.accountId}`}
                  className="flex items-baseline gap-2 hover:underline hover:decoration-rule-strong hover:underline-offset-4"
                >
                  <span className="num text-[0.8125rem] text-faint">{entry.accountNumber}</span>
                  <span className="text-ink">{entry.accountName}</span>
                </Link>
              </TD>
              <TD align="right">
                {entry.direction === 'Debit' ? (
                  <Money value={entry.amount} className="text-debit" />
                ) : (
                  <Money value={0} blankZero />
                )}
              </TD>
              <TD align="right" className="pr-0">
                {entry.direction === 'Credit' ? (
                  <Money value={entry.amount} className="text-credit" />
                ) : (
                  <Money value={0} blankZero />
                )}
              </TD>
            </TR>
          ))}
          <TotalRow>
            <td className="pl-0">
              <span className="eyebrow">Totals</span>
            </td>
            <td className="text-right">
              <Money value={debitTotal} emphasis="strong" />
            </td>
            <td className="pr-0 text-right">
              <Money value={creditTotal} emphasis="strong" />
            </td>
          </TotalRow>
        </TBody>
      </Table>

      {reversing ? (
        <ReverseDialog
          transaction={transaction}
          open
          onOpenChange={setReversing}
          onReversed={(reversalId) => {
            detail.reload()
            onReversed(reversalId)
          }}
        />
      ) : null}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="eyebrow w-32 shrink-0">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}

function LinkedTransaction({ id }: { id: number }) {
  return (
    <Link
      to={`/transactions?open=${id}`}
      className="num inline-flex items-center gap-1 text-[0.8125rem] text-ink underline decoration-rule-strong underline-offset-4"
    >
      #{id}
      <ArrowUpRightIcon className="size-3" />
    </Link>
  )
}

import { Link } from 'react-router-dom'

import { Money } from '@/components/Money'
import { Reference, TransactionMarks } from '@/components/TransactionMarks'
import { EmptyState } from '@/components/states'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import type { TransactionListItem } from '@/types/api'

export function RecentJournal({ transactions }: { transactions: TransactionListItem[] }) {
  if (transactions.length === 0) {
    return (
      <EmptyState title="No entries yet" />
    )
  }

  return (
    <div className="px-2 py-3">
      <Table>
        <THead>
          <tr>
            <TH>Date</TH>
            <TH>Reference</TH>
            <TH>Description</TH>
            <TH className="hidden sm:table-cell">Posted by</TH>
            <TH align="right">Amount</TH>
          </tr>
        </THead>
        <TBody>
          {transactions.map((transaction) => (
            <TR key={transaction.id} className="group hover:bg-accent/60">
              <TD className="num whitespace-nowrap text-[0.8125rem] text-muted">
                {formatDate(transaction.transactionDate)}
              </TD>
              <TD>
                <Link
                  to={`/transactions?open=${transaction.id}`}
                  className="underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-rule-strong"
                >
                  <Reference value={transaction.reference} reversed={transaction.isReversed} />
                </Link>
              </TD>
              <TD className="max-w-[22rem]">
                <span className="flex items-center gap-2">
                  <span className="truncate text-ink">{transaction.description}</span>
                  <TransactionMarks transaction={transaction} />
                </span>
              </TD>
              <TD className="hidden text-[0.8125rem] text-muted sm:table-cell">
                {transaction.createdBy}
              </TD>
              <TD align="right">
                <Money value={transaction.totalAmount} emphasis="strong" />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}

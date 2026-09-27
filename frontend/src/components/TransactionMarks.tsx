import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TransactionListItem } from '@/types/api'

/**
 * A transaction's standing, shown as a stamp rather than a status column.
 *
 * `isReversal` and `isReversed` are computed from the two self-referencing foreign keys, not
 * stored as flags (07 §6 / 08 §5): a transaction is *reversed* because another transaction
 * points at it. Nothing is ever edited to record that, which is the point — the original row
 * is exactly as it was written.
 */
export function TransactionMarks({
  transaction,
  className,
}: {
  transaction: Pick<TransactionListItem, 'isReversal' | 'isReversed'>
  className?: string
}) {
  if (!transaction.isReversal && !transaction.isReversed) return null

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {transaction.isReversed ? <Badge tone="stamp">Reversed</Badge> : null}
      {transaction.isReversal ? <Badge tone="outline">Reversal</Badge> : null}
    </span>
  )
}

/** The reference number: mono, and struck through once it has been reversed. */
export function Reference({
  value,
  reversed = false,
  className,
}: {
  value: string
  reversed?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'num text-[0.8125rem] whitespace-nowrap',
        reversed ? 'text-faint line-through decoration-danger/60' : 'text-ink',
        className,
      )}
    >
      {value}
    </span>
  )
}

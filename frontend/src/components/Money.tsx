import { cn } from '@/lib/utils'
import { formatAmount, formatSignedAmount } from '@/lib/format'

/**
 * Every amount on screen goes through this component.
 *
 * One component means the display rule cannot drift between the statement, the journal and
 * the trial balance: same decimals, same grouping, same right alignment, same treatment of
 * zero. It formats and never computes — see the note at the top of `lib/format.ts`.
 */
export function Money({
  value,
  signed = false,
  /** Print a rule instead of `0.00`. Standard in ruled columns: a blank cell reads as
   *  "nothing happened here", which is exactly what a zero total means. */
  blankZero = false,
  emphasis = 'normal',
  className,
}: {
  value: number
  signed?: boolean
  blankZero?: boolean
  emphasis?: 'normal' | 'strong' | 'muted'
  className?: string
}) {
  if (blankZero && value === 0) {
    return <span className="num select-none text-faint">—</span>
  }

  return (
    <span
      className={cn(
        'num tabular-nums',
        emphasis === 'strong' && 'font-medium text-ink',
        emphasis === 'muted' && 'text-muted',
        signed && value < 0 && 'text-danger',
        className,
      )}
    >
      {signed ? formatSignedAmount(value) : formatAmount(value)}
    </span>
  )
}

/** The currency caption that sits next to a headline figure, never inside the number. */
export function Currency({ code = 'BDT', className }: { code?: string; className?: string }) {
  return <span className={cn('eyebrow', className)}>{code}</span>
}

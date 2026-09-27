import { Badge } from '@/components/ui/badge'
import { abbreviate } from '@/lib/ledger'
import { cn } from '@/lib/utils'
import type { EntryDirection } from '@/types/api'

/**
 * Dr / Cr, in the direction's own hue.
 *
 * Indigo for debit, ochre for credit — deliberately not red and green. A debit is not a loss
 * and a credit is not a gain; they are sides of an entry. Colouring them red and green would
 * teach the user something an accountant would correct immediately, and red/green is reserved
 * for the profit-and-loss semantics this application does not report.
 */
export function DirectionChip({
  direction,
  className,
}: {
  direction: EntryDirection
  className?: string
}) {
  return (
    <Badge
      tone={direction === 'Debit' ? 'debit' : 'credit'}
      className={cn('w-7 justify-center normal-case', className)}
    >
      {abbreviate(direction)}
    </Badge>
  )
}
